package rpc

import (
	"context"
	"fmt"

	"github.com/40acres/40swap/daemon/crypto"
	"github.com/40acres/40swap/daemon/database/models"
	"github.com/40acres/40swap/daemon/lightning"
	"github.com/40acres/40swap/daemon/swaps"
	decodepay "github.com/nbd-wtf/ln-decodepay"
	log "github.com/sirupsen/logrus"
)

func (server *Server) SwapIn(ctx context.Context, req *SwapInRequest) (*SwapInResponse, error) {
	log.Infof("Received SwapIn request: %v", req)
	network := ToLightningNetworkType(req.Network)

	if err := lightning.CheckInvoicePrefix(req.Invoice, network); err != nil {
		return nil, err
	}

	invoice, err := decodepay.Decodepay(req.Invoice)
	if err != nil {
		return nil, fmt.Errorf("could not decode invoice: %w", err)
	}

	refundPrivateKey, RefundPublicKey, err := crypto.GenerateECKeyPair()
	if err != nil {
		return nil, fmt.Errorf("could not generate EC key pair: %w", err)
	}

	swap, err := server.swaps.CreateSwapIn(ctx, &swaps.CreateSwapInRequest{
		Chain:           models.Bitcoin,
		RefundPublicKey: RefundPublicKey,
		Invoice:         req.Invoice,
	})
	if err != nil {
		return nil, fmt.Errorf("could not create swap: %w", err)
	}

	err = server.Repository.SaveSwapIn(&models.SwapIn{
		SwapID: swap.SwapId,
		//nolint:gosec
		AmountSATS:         uint64(invoice.MSatoshi / 1000),
		Status:             models.SwapStatus(swap.Status),
		SourceChain:        models.Bitcoin,
		ClaimAddress:       swap.ContractAddress,
		TimeoutBlockHeight: uint64(swap.TimeoutBlockHeight),
		RefundPrivatekey:   refundPrivateKey,
		RedeemScript:       swap.RedeemScript,
		PaymentRequest:     req.Invoice,
		ServiceFeeSATS:     uint64(swap.InputAmount) - uint64(swap.OutputAmount),
	})
	if err != nil {
		return nil, fmt.Errorf("could not save swap: %w", err)
	}

	log.Info("Swap created: ", swap.SwapId)

	return &SwapInResponse{
		SwapId: swap.SwapId,
	}, nil
}

func (server *Server) SwapOut(ctx context.Context, req *SwapOutRequest) (*SwapOutResponse, error) {
	log.Info("HELLO WORLD")
	log.Infof("Received SwapOut request: %v", req)

	return &SwapOutResponse{}, nil
}
