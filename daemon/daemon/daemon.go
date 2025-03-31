// 40swap daemon to the lightning node
package daemon

import (
	"context"
	"fmt"

	"github.com/40acres/40swap/daemon/lightning"
	"github.com/40acres/40swap/daemon/rpc"
	"github.com/40acres/40swap/daemon/swaps"
	log "github.com/sirupsen/logrus"
)

func Start(ctx context.Context, server *rpc.Server, swapsClient *swaps.Client, network lightning.Network) error {
	log.Info("Starting 40swapd")

	config, err := swapsClient.GetConfiguration(ctx)
	if err != nil {
		return err
	}
	if config.BitcoinNetwork != network {
		return fmt.Errorf("network mismatch: expected %s, got %s", network, config.BitcoinNetwork)
	}

	log.Infof("Network is %s", network)

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
