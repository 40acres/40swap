package daemon

import (
	"context"
	"errors"
	"fmt"

	"github.com/40acres/40swap/daemon/bitcoin"
	"github.com/40acres/40swap/daemon/database/models"
	"github.com/40acres/40swap/daemon/swaps"
	decodepay "github.com/nbd-wtf/ln-decodepay"
	log "github.com/sirupsen/logrus"
)

func (m *SwapMonitor) MonitorSwapOut(ctx context.Context, currentSwap *models.SwapOut) error {
	logger := log.WithField("id", currentSwap.SwapID)
	logger.Info("processing swap out")

	newSwap, err := m.swapClient.GetSwapOut(ctx, currentSwap.SwapID)
	switch {
	case errors.Is(err, swaps.ErrSwapNotFound):
		logger.Warn("swap not found")

		outcome := models.OutcomeFailed
		currentSwap.Outcome = &outcome
		currentSwap.Status = models.StatusDone

		err := m.repository.SaveSwapOut(ctx, currentSwap)
		if err != nil {
			return fmt.Errorf("failed to save swap out: %w", err)
		}

		return nil
	case err != nil:
		return fmt.Errorf("failed to get swap out: %w", err)
	}

	newStatus := models.SwapStatus(newSwap.Status)
	changed := currentSwap.Status != newStatus

	// Update contract information from backend if available
	contractChanged := false
	if newSwap.ContractAddress != nil && *newSwap.ContractAddress != "" {
		if currentSwap.ContractAddress != *newSwap.ContractAddress {
			currentSwap.ContractAddress = *newSwap.ContractAddress
			contractChanged = true
			logger.Debugf("Updated contract address: %s", *newSwap.ContractAddress)
		}
	}
	if newSwap.RefundPublicKey != nil && *newSwap.RefundPublicKey != "" {
		if currentSwap.RefundPublicKey != *newSwap.RefundPublicKey {
			currentSwap.RefundPublicKey = *newSwap.RefundPublicKey
			contractChanged = true
			logger.Debugf("Updated refund public key: %s", *newSwap.RefundPublicKey)
		}
	}

	switch newStatus {
	case models.StatusCreated:
		logger.Debug("waiting for payment")
	case models.StatusInvoicePaymentIntentReceived:
		logger.Debug("off-chain payment detected")
	case models.StatusContractFundedUnconfirmed:
		logger.Debug("on-chain HTLC contract detected, waiting for confirmation")
		timeoutBlockHeight, err := safeUint32ToInt32(newSwap.TimeoutBlockHeight)
		if err != nil {
			return fmt.Errorf("invalid timeout block height: %w", err)
		}
		currentSwap.TimeoutBlockHeight = timeoutBlockHeight
	case models.StatusContractFunded:
		logger.Debug("contract funded confirmed, claiming on-chain tx")
		tx, err := m.ClaimSwapOut(ctx, currentSwap)
		if err != nil {
			return fmt.Errorf("failed to claim swap out: %w", err)
		}
		// Save the transaction ID
		currentSwap.TxID = tx
	case models.StatusContractClaimedUnconfirmed:
		logger.Debug("40swap has published the claim transaction, waiting for confirmation")
	case models.StatusDone:
		// Once it gets to DONE, we update the outcome
		currentSwap.Outcome = &newSwap.Outcome
		offchainFees, onchainFees, err := m.GetFeesSwapOut(ctx, currentSwap)
		if err != nil {
			return fmt.Errorf("failed to get fees: %w", err)
		}
		currentSwap.OffchainFeeSats = offchainFees
		currentSwap.OnchainFeeSats = onchainFees
	case models.StatusContractExpired:
	case models.StatusContractRefundedUnconfirmed:
		logger.Debug("contract refunded unconfirmed")
	}

	if changed || contractChanged {
		if changed {
			currentSwap.Status = newStatus
		}
		err := m.repository.SaveSwapOut(ctx, currentSwap)
		if err != nil {
			return fmt.Errorf("failed to save swap out: %w", err)
		}
	}

	logger.Debug("swap out processed")

	return nil
}

func (m *SwapMonitor) ClaimSwapOut(ctx context.Context, swap *models.SwapOut) (string, error) {
	logger := log.WithField("id", swap.SwapID)

	logger.Infof("Building claim transaction for swap out: %s", swap.SwapID)

	// Get recommended fee rate
	recommendedFeeRate, err := m.bitcoin.GetRecommendedFees(ctx, bitcoin.HalfHourFee)
	if err != nil {
		return "", fmt.Errorf("failed to get recommended fees: %w", err)
	}

	if recommendedFeeRate > 200 {
		return "", fmt.Errorf("recommended fee rate is too high: %d", recommendedFeeRate)
	}

	// Build claim transaction locally
	swapInfo, err := m.swapClient.GetSwapOut(ctx, swap.SwapID)
	if err != nil {
		return "", fmt.Errorf("failed to get swap info: %w", err)
	}

	if swapInfo.LockTx == nil {
		return "", fmt.Errorf("lock transaction not available for local construction")
	}

	psbtBuilder := NewPSBTBuilder(m.bitcoin, m.network)

	pkt, err := psbtBuilder.BuildClaimPSBT(ctx, swap, swapInfo, recommendedFeeRate, logger)
	if err != nil {
		return "", fmt.Errorf("failed to build claim PSBT: %w", err)
	}

	// Sign and broadcast the PSBT
	txID, err := psbtBuilder.SignAndBroadcastPSBT(ctx, pkt, swap.ClaimPrivateKey, swap.PreImage, logger)
	if err != nil {
		return "", fmt.Errorf("failed to sign and broadcast claim transaction: %w", err)
	}

	logger.Info("Successfully built and broadcast claim transaction locally")

	return txID, nil
}

func (m *SwapMonitor) GetFeesSwapOut(ctx context.Context, swap *models.SwapOut) (int64, int64, error) {
	invoice, err := decodepay.Decodepay(swap.PaymentRequest)
	if err != nil {
		return 0, 0, fmt.Errorf("failed to decode invoice: %w", err)
	}

	// Offchain fees
	_, offchainFees, monitorErr := m.lightningClient.MonitorPaymentRequest(context.Background(), invoice.PaymentHash)
	if monitorErr != nil {
		return 0, 0, fmt.Errorf("failed to monitor payment request: %w", monitorErr)
	}

	// Onchain fees
	onchainFees, err := m.bitcoin.GetFeeFromTxId(ctx, swap.TxID) // TODO: try to get the fees from the PSBT in the future
	if err != nil {
		return 0, 0, fmt.Errorf("failed to get transaction from outpoint: %w", err)
	}

	return offchainFees, onchainFees, nil
}
