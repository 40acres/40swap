// 40swap daemon to the lightning node
package daemon

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/40acres/40swap/daemon/database"
	"github.com/40acres/40swap/daemon/database/models"
	"github.com/40acres/40swap/daemon/lightning"
	"github.com/40acres/40swap/daemon/rpc"
	"github.com/40acres/40swap/daemon/swaps"
	log "github.com/sirupsen/logrus"
)

const MONITORING_INTERVAL_SECONDS = 10

type Repository interface {
	database.SwapInRepository
	database.SwapOutRepository
}

func Start(ctx context.Context, server *rpc.Server, db Repository, swaps swaps.ClientInterface, network lightning.Network) error {
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
				now:        time.Now,
				network:    network,
			}
			monitor.MonitorSwaps(ctx)

			time.Sleep(MONITORING_INTERVAL_SECONDS * time.Second)
		}
	}
}

type SwapMonitor struct {
	repository Repository
	swapClient swaps.ClientInterface
	now        func() time.Time
	network    lightning.Network
}

func (m *SwapMonitor) MonitorSwaps(ctx context.Context) {
	swapIns, err := m.repository.GetPendingSwapIns()
	if err != nil {
		log.Errorf("failed to get pending swap ins: %v", err)

		return
	}

	swapOuts, err := m.repository.GetPendingSwapOuts()
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

func (m *SwapMonitor) MonitorSwapIn(ctx context.Context, currentSwap models.SwapIn) error {
	logger := log.WithField("id", currentSwap.SwapID)
	logger.Info("processing swap")

	newSwap, err := m.swapClient.GetSwapIn(ctx, currentSwap.SwapID)
	switch {
	case errors.Is(err, swaps.ErrSwapNotFound):
		logger.Warn("swap not found")

		outcome := models.OutcomeFailed
		currentSwap.Outcome = &outcome

		err := m.repository.SaveSwapIn(&currentSwap)
		if err != nil {
			return fmt.Errorf("failed to save swap in: %w", err)
		}

		return nil
	case err != nil:
		return fmt.Errorf("failed to get swap in: %w", err)
	}

	newStatus := models.SwapStatus(newSwap.Status)
	changed := currentSwap.Status != newStatus
	switch newStatus {
	case models.StatusCreated:
		// Do nothing
		logger.Debug("waiting for payment")
	case models.StatusContractFundedUnconfirmed:
		logger.Debug("on-chain payment detected, waiting for confirmation")
	case models.StatusContractFunded:
		logger.Debug("contract funded, waiting for 40swap to pay the invoice")
	case models.StatusInvoicePaid:
		logger.Debug("lightning invoice paid, claiming on-chain tx")
	case models.StatusContractClaimedUnconfirmed:
		logger.Debug("40swap has paid your lightning invoice and claimed the on-chain funds, waiting for confirmation")
	case models.StatusDone:
		switch models.SwapOutcome(newSwap.Outcome) {
		case models.OutcomeRefunded:
			outcome := models.OutcomeRefunded
			currentSwap.Outcome = &outcome
			logger.Debug("failed. The funds have been refunded")
		case models.OutcomeExpired:
			outcome := models.OutcomeExpired
			currentSwap.Outcome = &outcome
			logger.Debug("failed. The contract has expired, waiting to be refunded")
		default:
			outcome := models.OutcomeSuccess
			currentSwap.Outcome = &outcome
			// FAILED doesn't exist in the 40swap backend so we don't need to check it
			logger.Debug("success. The funds have been claimed")
		}
	case models.StatusContractRefundedUnconfirmed:
		log.Debug("the refund has been sent, waiting for on-chain confirmation")
	case models.StatusContractExpired:
		if currentSwap.RefundRequestedAt.IsZero() { // check refund was requested
			currentSwap.RefundRequestedAt = m.now()
			log.Info("on-chain contract expired. initiating a refund'")
			// TODO: Initiate a refund
		} else {
			log.Debug("on-chain contract expired. Refund is in-progress")
		}
	}

	if changed {
		currentSwap.Status = newStatus
		err := m.repository.SaveSwapIn(&currentSwap)
		if err != nil {
			return fmt.Errorf("failed to save swap in: %w", err)
		}
	}

	logger.Debug("swap in processed")

	return nil
}

func (m *SwapMonitor) MonitorSwapOut(ctx context.Context, currentSwap models.SwapOut) error {
	logger := log.WithField("id", currentSwap.SwapID)
	logger.Info("processing swap out")

	newSwap, err := m.swapClient.GetSwapOut(ctx, currentSwap.SwapID)
	switch {
	case errors.Is(err, swaps.ErrSwapNotFound):
		logger.Warn("swap not found")

		currentSwap.Status = models.StatusDone

		err := m.repository.SaveSwapOut(&currentSwap)
		if err != nil {
			return fmt.Errorf("failed to save swap out: %w", err)
		}
	case err != nil:
		return fmt.Errorf("failed to get swap out: %w", err)
	}

	newStatus := models.SwapStatus(newSwap.Status)
	changed := currentSwap.Status != newStatus
	switch newStatus {
	case models.StatusCreated:
		logger.Debug("Waiting for payment")
	case models.StatusInvoicePaymentIntentReceived:
		logger.Debug("Off-chain payment detected")
	case models.StatusContractFundedUnconfirmed:
		logger.Debug("On-chain payment detected, waiting for confirmation")
		currentSwap.TimeoutBlockHeight = int64(newSwap.TimeoutBlockHeight)
	case models.StatusContractFunded:
		logger.Debug("Contract funded confirmed, claiming on-chain tx")
		// TODO: claim the on-chain tx
		err := m.ClaimSwapOut(ctx, &currentSwap)
		if err != nil {
			return fmt.Errorf("failed to claim swap out: %w", err)
		}
	case models.StatusContractClaimedUnconfirmed:
		logger.Debug("40swap has published the claim transaction, waiting for confirmation")
	case models.StatusDone:
		// Once it gets to DONE, we update the outcome
		currentSwap.Outcome = &newSwap.Outcome
	case models.StatusContractExpired:
	case models.StatusContractRefundedUnconfirmed:
	}

	if changed {
		currentSwap.Status = newStatus
		err := m.repository.SaveSwapOut(&currentSwap)
		if err != nil {
			return fmt.Errorf("failed to save swap out: %w", err)
		}
	}

	logger.Infof("swap out processed")

	return nil
}
