package rpc

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"fmt"

	"github.com/40acres/40swap/daemon/database/models"
	"github.com/40acres/40swap/daemon/money"
	"github.com/40acres/40swap/daemon/swaps"
	"github.com/lightningnetwork/lnd/lntypes"
	log "github.com/sirupsen/logrus"
)

func (server *Server) CreateSwapOut(ctx context.Context, claimPubKey string, amountSats money.Money) (*swaps.SwapOutResponse, *lntypes.Preimage, error) {
	log.Info("Creating swap")

	preimageBytes := make([]byte, 32)
	_, _ = rand.Read(preimageBytes)
	hash := sha256.New()
	hash.Write(preimageBytes)
	preimageHash := hash.Sum(nil)

	preimage, err := lntypes.MakePreimage(preimageHash)
	if err != nil {
		return nil, nil, fmt.Errorf("could not create preimage: %w", err)
	}

	swapRequest := swaps.CreateSwapOutRequest{
		Chain:        models.Bitcoin,
		PreImageHash: preimage.String(),
		ClaimPubKey:  claimPubKey,
		Amount:       amountSats,
	}

	swap, err := server.swapClient.CreateSwapOut(ctx, swapRequest)
	if err != nil {
		return nil, nil, err
	}

	return swap, &preimage, nil
}
