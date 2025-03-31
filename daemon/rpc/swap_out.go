package rpc

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"

	"github.com/40acres/40swap/daemon/database/models"
	"github.com/40acres/40swap/daemon/money"
	"github.com/40acres/40swap/daemon/swaps"
	log "github.com/sirupsen/logrus"
)

func (server *Server) CreateSwapOut(ctx context.Context, claimPubKey string, amountSats money.Money) (*swaps.SwapOutResponse, error) {
	log.Info("Creating swap")

	preimage := make([]byte, 32)
	_, _ = rand.Read(preimage)
	hash := sha256.New()
	hash.Write(preimage)
	preimageHash := hash.Sum(nil)

	swapRequest := swaps.CreateSwapOutRequest{
		Chain:        models.Bitcoin,
		PreImageHash: hex.EncodeToString(preimageHash),
		ClaimPubKey:  claimPubKey,
		Amount:       amountSats,
	}

	swap, err := server.swapClient.CreateSwapOut(ctx, swapRequest)
	if err != nil {
		return nil, err
	}

	return swap, nil
}
