// 40swap daemon to the lightning node
package daemon

import (
	"context"

	"github.com/40acres/40swap/daemon/database"
	"github.com/40acres/40swap/daemon/swap"
	log "github.com/sirupsen/logrus"
)

func Start(ctx context.Context, db *database.Database) error {
	log.Info("Starting 40swapd")
	// TODO

	swapout := &swap.SwapOut{Status: "pending"}
	db.ORM().Create(swapout)

	// List all swapouts
	swapouts, err := db.ORM().Find(&swap.SwapOut{}).Rows()
	if err != nil {
		return err
	}
	log.Info("Swapouts: ", swapouts)

	// Block here until context is cancelled
	<-ctx.Done()
	log.Info("Shutting down 40swapd")

	return nil
}
