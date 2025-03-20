// 40swap daemon to the lightning node
package daemon

import (
	"context"
	"time"

	"github.com/40acres/40swap/daemon/database"
	"github.com/40acres/40swap/daemon/rpc"
	"github.com/40acres/40swap/daemon/swaps"
	log "github.com/sirupsen/logrus"
)

const MONITORING_INTERVAL_SECONDS = 10

func Start(ctx context.Context, server *rpc.Server, db database.SwapInRepository, swaps swaps.ClientInterface, network rpc.Network) error {
	log.Info("Starting 40swapd")

	go func() {
		err := server.ListenAndServe()
		if err != nil {
			log.Fatalf("couldn't start server: %v", err)
		}
	}()

	// monitor every 10 seconds
	for {
		select {
		case <-ctx.Done():
			log.Info("Shutting down 40swapd")

			return nil
		default:
			MonitorSwapIn(ctx, db, swaps)

			time.Sleep(MONITORING_INTERVAL_SECONDS * time.Second)
		}
	}
}

func MonitorSwapIn(ctx context.Context, db database.SwapInRepository, swaps swaps.ClientInterface) {
	swapIns, err := db.GetPendingSwapIns()
	if err != nil {
		log.Errorf("failed to get pending swap ins: %v", err)

		return
	}

	for _, swapIn := range swapIns {
		log.Infof("processing swap with id: %s", swapIn.SwapID)

		_, err := swaps.GetSwapIn(ctx, swapIn.SwapID)
		if err != nil {
			log.Errorf("failed to get swap in: %v", err)

			continue
		}
	}
}
