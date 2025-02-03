// 40swap daemon to the lightning node
package daemon

import (
	"context"
	"time"

	"github.com/40acres/40swap/daemon/database"
	"github.com/40acres/40swap/daemon/swap"
	log "github.com/sirupsen/logrus"
)

func Start(ctx context.Context, db *database.Database) error {
	log.Info("Starting 40swapd")
	// TODO

	// tests
	swapout := &swap.SwapOut{
		Datetime:           time.Now(),
		Status:             "pending",
		AmountSATS:         100000,
		DestinationAddress: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
		ServiceFee:         0.0001,
		OnchainFee:         0.0001,
		OffchainFee:        0.0001,
		DestinationChain:   "bitcoin",
		ClaimPubkey:        "02b2",
		Invoice:            "lnbc100u1p0",
		Description:        "Test swap out",
		MaxRoutingFeeRatio: 0.01,
	}
	if err := db.ORM().Create(&swapout).Error; err != nil {
		log.Fatalf("Error insertando swapout: %v", err)
	}
	var swaps []swap.SwapOut
	if err := db.ORM().Find(&swaps).Error; err != nil {
		log.Fatalf("Error leyendo swapouts: %v", err)
	}
	log.Info("Swapouts:")
	for _, u := range swaps {
		log.Info(u)
	}

	// Block here until context is cancelled
	<-ctx.Done()
	log.Info("Shutting down 40swapd")

	return nil
}
