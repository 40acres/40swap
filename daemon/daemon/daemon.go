// 40swap daemon to the lightning node
package daemon

import (
	"context"
	"fmt"
	"time"

	"github.com/40acres/40swap/daemon/bitcoin"
	"github.com/40acres/40swap/daemon/database"
	"github.com/40acres/40swap/daemon/lightning"
	"github.com/40acres/40swap/daemon/rpc"
	swaps "github.com/40acres/40swap/daemon/swaps"
	log "github.com/sirupsen/logrus"
)

const MONITORING_INTERVAL_SECONDS = 10

type Repository interface {
	database.SwapInRepository
	database.SwapOutRepository
}

func Start(ctx context.Context, server *rpc.Server, db Repository, swaps swaps.ClientInterface, lightning lightning.Client, bitcoin bitcoin.Client, network lightning.Network, autoSwapService *AutoSwapService) error {
	log.Infof("Starting 40swapd on network %s", network)

	config, err := swaps.GetConfiguration(ctx)
	if err != nil {
		return err
	}
	if config.BitcoinNetwork != network {
		return fmt.Errorf("network mismatch: daemon expected %s, server's got %s", network, config.BitcoinNetwork)
	}

	go func() {
		err := server.ListenAndServe()
		if err != nil {
			log.Fatalf("couldn't start server: %v", err)
		}
	}()

	// Start the auto swap loop in a goroutine if auto swap service is provided
	if autoSwapService != nil {
		go StartAutoSwapLoop(ctx, autoSwapService)
	}

	// monitor every 10 seconds
	for {
		select {
		case <-ctx.Done():
			log.Info("Shutting down 40swapd")

			return nil
		default:
			monitor := &SwapMonitor{
				repository:      db,
				swapClient:      swaps,
				lightningClient: lightning,
				network:         network,
				now:             time.Now,
				bitcoin:         bitcoin,
			}
			monitor.MonitorSwaps(ctx)

			time.Sleep(MONITORING_INTERVAL_SECONDS * time.Second)
		}
	}
}

// StartAutoSwapLoop runs the auto swap check every config.GetCheckInterval()
func StartAutoSwapLoop(ctx context.Context, autoSwapService *AutoSwapService) {
	log.Infof("[AutoSwap] Starting auto swap loop")

	// Recover any pending auto swaps from the database
	if err := autoSwapService.RecoverPendingAutoSwaps(ctx); err != nil {
		log.Errorf("[AutoSwap] Failed to recover pending auto swaps: %v", err)
	}

	for {
		select {
		case <-ctx.Done():
			log.Info("[AutoSwap] Shutting down auto swap loop")

			return
		default:
			// Run the auto swap check
			if err := autoSwapService.RunAutoSwapCheck(ctx); err != nil {
				log.Errorf("[AutoSwap] Auto swap check failed: %v", err)
			}

			// Wait for the configured interval
			time.Sleep(autoSwapService.GetCheckInterval())
		}
	}
}

type SwapMonitor struct {
	repository      Repository
	swapClient      swaps.ClientInterface
	lightningClient lightning.Client
	network         lightning.Network
	now             func() time.Time
	bitcoin         bitcoin.Client
}

func (m *SwapMonitor) MonitorSwaps(ctx context.Context) {
	swapIns, err := m.repository.GetPendingSwapIns(ctx)
	if err != nil {
		log.Errorf("failed to get pending swap ins: %v", err)

		return
	}

	swapOuts, err := m.repository.GetPendingSwapOuts(ctx)
	if err != nil {
		log.Errorf("failed to get pending swap outs: %v", err)

		return
	}

	for _, swapIn := range swapIns {
		err := m.MonitorSwapIn(ctx, swapIn)
		if err != nil {
			log.Errorf("failed to monitor swap in: %v", err)

			continue
		}
	}

	for _, swapOut := range swapOuts {
		err := m.MonitorSwapOut(ctx, swapOut)
		if err != nil {
			log.Errorf("failed to monitor swap out: %v", err)

			continue
		}
	}
}
