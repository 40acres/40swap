package rpc

import (
	"context"
	"encoding/hex"
	"fmt"

	"github.com/40acres/40swap/daemon/database/models"
	"github.com/40acres/40swap/daemon/money"
	"github.com/btcsuite/btcd/btcec/v2"
	"github.com/btcsuite/btcd/btcutil"

	log "github.com/sirupsen/logrus"
)

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
	swap, err := server.CreateSwapOut(ctx, pubkey, req.AmountSats)
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
