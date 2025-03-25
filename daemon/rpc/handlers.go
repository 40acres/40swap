package rpc

import (
	"context"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/40acres/40swap/daemon/database/models"
	"github.com/40acres/40swap/daemon/lightning"
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

		invoice, _, err := server.lnClient.GenerateInvoice(ctx, amt, expiry, "")
		if err != nil {
			return nil, fmt.Errorf("could not generate invoice: %w", err)
		}

		req.Invoice = &invoice
	}

	invoice, err := zpay32.Decode(*req.Invoice, lightning.ToChainCfgNetwork(network))
	if err != nil {
		return nil, fmt.Errorf("invalid invoice: %w", err)
	}

	_, err = btcutil.DecodeAddress(req.RefundTo, lightning.ToChainCfgNetwork(network))
	if err != nil {
		return nil, fmt.Errorf("invalid refund address: %w", err)
	}

	refundPrivateKey, err := btcec.NewPrivateKey()
	if err != nil {
		return nil, fmt.Errorf("could not generate EC key pair: %w", err)
	}

	chain := ToModelsChainType(req.Chain)

	swap, err := server.swaps.CreateSwapIn(ctx, &swaps.CreateSwapInRequest{
		Chain:           chain,
		RefundPublicKey: hex.EncodeToString(refundPrivateKey.PubKey().SerializeCompressed()),
		Invoice:         *req.Invoice,
	})
	if err != nil {
		return nil, fmt.Errorf("could not create swap: %w", err)
	}

	invoiceAmountSats := decimal.NewFromInt(int64(invoice.MilliSat.ToSatoshis()))
	inputAmountBtc := decimal.NewFromFloat32(swap.InputAmount)
	// TODO: fetch from config controller
	serviceFee := decimal.NewFromFloat(0.5)
	serviceFeeSats := invoiceAmountSats.Mul(serviceFee).IntPart()

	err = server.Repository.SaveSwapIn(&models.SwapIn{
		SwapID: swap.SwapId,
		//nolint:gosec
		AmountSats:         int64(*invoice.MilliSat / 1000),
		Status:             models.SwapStatus(swap.Status),
		SourceChain:        chain,
		ClaimAddress:       swap.ContractAddress,
		TimeoutBlockHeight: int64(swap.TimeoutBlockHeight),
		RefundPrivatekey:   hex.EncodeToString(refundPrivateKey.Serialize()),
		RedeemScript:       swap.RedeemScript,
		PaymentRequest:     *req.Invoice,
		ServiceFeeSats:     int64(serviceFeeSats),
	})
	if err != nil {
		return nil, fmt.Errorf("could not save swap: %w", err)
	}

	log.Info("Swap created: ", swap.SwapId)

	return &SwapInResponse{
		SwapId:       swap.SwapId,
		AmountSats:   uint32(inputAmountBtc.Mul(decimal.NewFromInt(1e8)).IntPart()), // nolint:gosec,
		ClaimAddress: swap.ContractAddress,
	}, nil
}

func (server *Server) SwapOut(ctx context.Context, req *SwapOutRequest) (*SwapOutResponse, error) {
	log.Info("HELLO WORLD")
	log.Infof("Received SwapOut request: %v", req)

	return &SwapOutResponse{}, nil
}
