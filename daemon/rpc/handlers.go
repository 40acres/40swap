package rpc

import (
	"context"
	"encoding/hex"
	"fmt"

	"github.com/40acres/40swap/daemon/crypto"
	"github.com/40acres/40swap/daemon/database/models"
	"github.com/40acres/40swap/daemon/lightning"
	"github.com/40acres/40swap/daemon/swaps"
	"github.com/lightningnetwork/lnd/zpay32"
	log "github.com/sirupsen/logrus"
)

func (server *Server) SwapIn(ctx context.Context, req *SwapInRequest) (*SwapInResponse, error) {
	log.Infof("Received SwapIn request: %v", req)
	network := ToLightningNetworkType(req.Network)

	invoice, err := zpay32.Decode(req.Invoice, lightning.ToChainCfgNetwork(network))
	if err != nil {
		return nil, fmt.Errorf("could not decode invoice: %w", err)
	}

	refundPrivateKey, err := crypto.GenerateECKey()
	if err != nil {
		return nil, fmt.Errorf("could not generate EC key pair: %w", err)
	}

	chain := ToModelsChainType(req.Chain)

	swap, err := server.swaps.CreateSwapIn(ctx, &swaps.CreateSwapInRequest{
		Chain:           chain,
		RefundPublicKey: hex.EncodeToString(refundPrivateKey.PubKey().SerializeCompressed()),
		Invoice:         req.Invoice,
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
		PaymentRequest:     req.Invoice,
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
	log.Info("HELLO WORLD")
	log.Infof("Received SwapOut request: %v", req)

	return &SwapOutResponse{}, nil
}
