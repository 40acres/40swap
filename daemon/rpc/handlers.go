package rpc

import (
	"context"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/40acres/40swap/daemon/database/models"
	"github.com/40acres/40swap/daemon/lightning"
	"github.com/40acres/40swap/daemon/money"
	"github.com/40acres/40swap/daemon/swaps"
	"github.com/btcsuite/btcd/btcec/v2"
	"github.com/btcsuite/btcd/btcutil"
	"github.com/lightningnetwork/lnd/zpay32"
	"github.com/shopspring/decimal"
	log "github.com/sirupsen/logrus"
)

func (server *Server) SwapIn(ctx context.Context, req *SwapInRequest) (*SwapInResponse, error) {
	log.Infof("Received SwapIn request: %v", req)
	network := ToLightningNetworkType(server.network)

	if req.Invoice == nil {
		if req.AmountSats == nil {
			return nil, fmt.Errorf("either invoice or amountSats must be provided")
		}
		amt := decimal.NewFromUint64(uint64(*req.AmountSats))

		// 3 days
		expiry := 3 * 24 * 60 * 60 * time.Second
		if req.Expiry != nil {
			expiry = time.Duration(*req.Expiry) * time.Second
		}

		invoice, _, err := server.lightningClient.GenerateInvoice(ctx, amt, expiry, "")
		if err != nil {
			return nil, fmt.Errorf("could not generate invoice: %w", err)
		}

		req.Invoice = &invoice
	}

	invoice, err := zpay32.Decode(*req.Invoice, lightning.ToChainCfgNetwork(network))
	if err != nil {
		return nil, fmt.Errorf("could not decode invoice: %w", err)
	}

	refundPrivateKey, err := btcec.NewPrivateKey()
	if err != nil {
		return nil, fmt.Errorf("could not generate EC key pair: %w", err)
	}

	chain := ToModelsChainType(req.Chain)

	swap, err := server.swapClient.CreateSwapIn(ctx, &swaps.CreateSwapInRequest{
		Chain:           chain,
		RefundPublicKey: hex.EncodeToString(refundPrivateKey.PubKey().SerializeCompressed()),
		Invoice:         *req.Invoice,
	})
	if err != nil {
		return nil, fmt.Errorf("could not create swap: %w", err)
	}

	err = server.Repository.SaveSwapIn(&models.SwapIn{
		SwapID: swap.SwapId,
		//nolint:gosec
		AmountSATS:         uint64(*invoice.MilliSat / 1000),
		Status:             models.SwapStatus(swap.Status),
		SourceChain:        chain,
		ClaimAddress:       swap.ContractAddress,
		TimeoutBlockHeight: uint64(swap.TimeoutBlockHeight),
		RefundPrivatekey:   hex.EncodeToString(refundPrivateKey.Serialize()),
		RedeemScript:       swap.RedeemScript,
		PaymentRequest:     *req.Invoice,
		ServiceFeeSATS:     uint64(swap.InputAmount) - uint64(swap.OutputAmount),
	})
	if err != nil {
		return nil, fmt.Errorf("could not save swap: %w", err)
	}

	log.Info("Swap created: ", swap.SwapId)

	return &SwapInResponse{
		SwapId:       swap.SwapId,
		ClaimAddress: swap.ContractAddress,
	}, nil
}

func (server *Server) SwapOut(ctx context.Context, req *SwapOutRequest) (*SwapOutResponse, error) {
	log.Info("Swapping out")

	// Validate request
	if req.AmountSats <= 0 {
		return nil, fmt.Errorf("amount must be greater than 0")
	}

	_, err := btcutil.DecodeAddress(req.Address, ToChainCfgNetwork(server.network))
	if err != nil {
		return nil, fmt.Errorf("invalid address: %w", err)
	}

	// Private key for the claim
	claimKey, err := btcec.NewPrivateKey()
	if err != nil {
		return nil, err
	}
	pubkey := hex.EncodeToString(claimKey.PubKey().SerializeCompressed())

	// Create swap out
	swap, err := server.CreateSwapOut(ctx, pubkey, money.Money(req.AmountSats))
	if err != nil {
		log.Error("Error creating swap: ", err)

		return nil, fmt.Errorf("error creating the swap: %w", err)
	}

	// Save swap to the database
	amount, err := money.NewFromBtc(swap.InputAmount)
	if err != nil {
		return nil, err
	}
	serviceFee, err := money.NewFromBtc(swap.InputAmount.Add(swap.OutputAmount.Neg()))
	if err != nil {
		return nil, err
	}

	swapModel := models.SwapOut{
		// SwapId:             swap.SwapId, // Wait we merge the models
		Status:             swap.Status,
		DestinationAddress: req.Address,
		DestinationChain:   models.Bitcoin,
		ClaimPubkey:        hex.EncodeToString(claimKey.Serialize()), // TODO: Add claim pubkey to the model
		PaymentRequest:     swap.Invoice,
		AmountSATS:         uint64(amount),
		ServiceFeeSATS:     uint64(serviceFee),
		MaxRoutingFeeRatio: 0.005, // 0.5% is a good max value for Lightning Network
	}

	err = server.Repository.SaveSwapOut(&swapModel)
	if err != nil {
		return nil, err
	}

	// Send L2 payment
	err = server.lightningClient.PayInvoice(ctx, swap.Invoice, swapModel.MaxRoutingFeeRatio)
	if err != nil {
		log.Error("Error paying the invoice: ", err)

		return nil, fmt.Errorf("error paying the invoice: %w", err)
	}

	return &SwapOutResponse{}, nil
}
