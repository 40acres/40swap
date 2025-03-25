// 40swap daemon to the lightning node
package daemon

import (
	"context"

	"github.com/40acres/40swap/daemon/database"
	"github.com/40acres/40swap/daemon/lightning"
	"github.com/40acres/40swap/daemon/rpc"
	"github.com/40acres/40swap/daemon/swaps"
	log "github.com/sirupsen/logrus"
)

func Start(ctx context.Context, db *database.Database, grpcPort uint32, lightningClient lightning.Client, swapClient swaps.ClientInterface, network rpc.Network) error {
	log.Info("Starting 40swapd")

	// gRPC server
	server := rpc.NewRPCServer(grpcPort, db, swapClient, lightningClient, network)
	defer server.Stop()
	go func() {
		err := server.ListenAndServe()
		if err != nil {
			log.Fatalf("couldn't start server: %v", err)
		}
	}()

	// Block here until context is cancelled
	<-ctx.Done()
	log.Info("Shutting down 40swapd")

	return nil
}
