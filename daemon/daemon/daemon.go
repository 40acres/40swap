// 40swap daemon to the lightning node
package daemon

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/40acres/40swap/daemon/database"
	"github.com/40acres/40swap/daemon/database/models"
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
			monitor := &SwapMonitor{
				repository: db,
				swapClient: swaps,
			}
			monitor.MonitorSwaps(ctx)

			time.Sleep(MONITORING_INTERVAL_SECONDS * time.Second)
		}
	}
}

type SwapMonitor struct {
	repository interface {
		database.SwapInRepository
	}
	swapClient swaps.ClientInterface
}

func (m *SwapMonitor) MonitorSwaps(ctx context.Context) {
	swapIns, err := m.repository.GetPendingSwapIns()
	if err != nil {
		log.Errorf("failed to get pending swap ins: %v", err)

		return
	}

	for _, swapIn := range swapIns {
		err := m.MonitorSwapIn(ctx, swapIn)
		if err != nil {
			log.Errorf("failed to monitor swap in: %v", err)

			continue
		}
	}
}

func (m *SwapMonitor) MonitorSwapIn(ctx context.Context, currentSwap models.SwapIn) error {
	logger := log.WithField("id", currentSwap.SwapID)
	logger.Info("processing swap")

	newSwap, err := m.swapClient.GetSwapIn(ctx, currentSwap.SwapID)
	switch {
	case errors.Is(err, swaps.ErrSwapNotFound):
		logger.Warn("swap not found")

		// TODO: create field OUTCOME
		currentSwap.Status = models.StatusDone

		err := m.repository.SaveSwapIn(&currentSwap)
		if err != nil {
			return fmt.Errorf("failed to save swap in: %w", err)
		}
	case err != nil:
		return fmt.Errorf("failed to get swap in: %w", err)
	}

	changed := currentSwap.Status == models.SwapStatus(newSwap.Status)
	switch currentSwap.Status {
	case models.StatusCreated:
		// Do nothing
		logger.Debug("Waiting for payment")
	case models.StatusContractFundedUnconfirmed:
		logger.Debug("On-chain payment detected, waiting for confirmation")
	case models.StatusContractFunded:
		logger.Debug("Contract funded, waiting for 40swap to pay the invoice")
	case models.StatusInvoicePaid:
		logger.Debug("Lightning invoice paid, claiming on-chain tx")
	case models.StatusContractClaimedUnconfirmed:
		logger.Debug("40swap has paid your lightning invoice and claimed the on-chain funds, waiting for confirmation")
	case models.StatusDone:
		// TODO: save outcome
		if newSwap.Outcome == "REFUNDED" {
			logger.Debug("Failed. The funds have been refunded")
		} else if newSwap.Outcome == "EXPIRED" {
			logger.Debug("Failed. The contract has expired, waiting to be refunded")
		} else {
			logger.Debug("Success. The funds have been claimed")
		}
	case models.StatusContractRefundedUnconfirmed:
		log.Debug("The refund has been sent, waiting for on-chain confirmation")
	case models.StatusContractExpired:
		if true { // check refund was requested
			log.Info("On-chain contract expired. initiating a refund'")
		} else {
			log.Debug("On-chain contract expired. Refund is in-progress")
		}
	}

	if changed {
		err := m.repository.SaveSwapIn(&currentSwap)
		if err != nil {
			return fmt.Errorf("failed to save swap in: %w", err)
		}
	}

	log.Infof("swap in processed with id: %s", currentSwap.SwapID)

	return nil
}
