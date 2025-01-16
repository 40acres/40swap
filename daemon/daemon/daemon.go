// 40swap daemon to the lightning node
package daemon

import (
	"context"

	log "github.com/sirupsen/logrus"
)

func Start(ctx context.Context) {
	log.Info("Starting 40swapd")

	// Block here until context is cancelled
	select {
	case <-ctx.Done():
		log.Info("Shutting down 40swapd")
	}
}
