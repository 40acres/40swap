// 40swap daemon to the lightning node
package daemon

import (
	"context"

	"github.com/40acres/40swap/daemon/database"
	"github.com/40acres/40swap/daemon/lib/lightning/lnd"
	log "github.com/sirupsen/logrus"
)

func Start(ctx context.Context, db *database.Database) error {
	log.Info("Starting 40swapd")
	// TODO
	// Connect to LND
	_, err := lnd.NewClient(
		ctx,
		lnd.WithLndEndpoint("localhost:10009"),
		lnd.WithNetwork(lnd.Regtest),
		// Remember to fill with the correct paths
		lnd.WithMacaroonFilePath(""),
		lnd.WithTLSCertFilePath(""),
	)
	if err != nil {
		return err
	}

	// Block here until context is cancelled
	<-ctx.Done()
	log.Info("Shutting down 40swapd")

	return nil
}
