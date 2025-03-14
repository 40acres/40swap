// 40swap daemon to the lightning node
package daemon

import (
	"context"

	"github.com/40acres/40swap/daemon/database"
	"github.com/40acres/40swap/daemon/rpc"
	log "github.com/sirupsen/logrus"
)

func Start(ctx context.Context, db database.Client, grpcPort uint32) error {
	log.Info("Starting 40swapd")

	// gRPC server
	server := rpc.NewRPCServer(grpcPort, db)
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
