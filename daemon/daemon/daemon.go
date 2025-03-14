// 40swap daemon to the lightning node
package daemon

import (
	"context"

	"github.com/40acres/40swap/daemon/database"
	log "github.com/sirupsen/logrus"
)

func Start(ctx context.Context, db database.Client) error {
	log.Info("Starting 40swapd")
	// TODO

	// Block here until context is cancelled
	<-ctx.Done()
	log.Info("Shutting down 40swapd")

	return nil
}
