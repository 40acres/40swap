// 40swap daemon to the lightning node
package daemon

import (
	"context"

	log "github.com/sirupsen/logrus"
)

func Start(ctx context.Context) error {
	log.Info("Starting 40swapd")
	// TODO

	// Block here until context is cancelled
	select {
	case <-ctx.Done():
		log.Info("Shutting down 40swapd")

	}

	return nil
}
