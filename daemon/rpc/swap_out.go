package rpc

import (
	"context"
	"crypto/rand"
	"fmt"

	"github.com/40acres/40swap/daemon/database/models"
	"github.com/40acres/40swap/daemon/money"
	"github.com/40acres/40swap/daemon/swaps"
	"github.com/lightningnetwork/lnd/lntypes"
	log "github.com/sirupsen/logrus"
)

const preimageSize = 32

func (server *Server) CreateSwapOut(ctx context.Context, claimPubKey string, amountSats money.Money) (*swaps.SwapOutResponse, *lntypes.Preimage, error) {
	log.Info("Creating swap")

	preimageBytes := make([]byte, preimageSize)
	_, _ = rand.Read(preimageBytes)

	preimage, err := lntypes.MakePreimage(preimageBytes)
	if err != nil {
		return nil, nil, fmt.Errorf("could not create preimage: %w", err)
	}

	swapRequest := swaps.CreateSwapOutRequest{
		Chain:        models.Bitcoin,
		PreImageHash: preimage.Hash().String(),
		ClaimPubKey:  claimPubKey,
		Amount:       amountSats,
	}

	swap, err := server.swapClient.CreateSwapOut(ctx, swapRequest)
	if err != nil {
		return nil, nil, err
	}

	return swap, &preimage, nil
}
