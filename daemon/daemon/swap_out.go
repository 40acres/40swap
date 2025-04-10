package daemon

import (
	"context"
	"errors"
	"fmt"

	"github.com/40acres/40swap/daemon/bitcoin"
	"github.com/40acres/40swap/daemon/database/models"
	"github.com/40acres/40swap/daemon/swaps"
	log "github.com/sirupsen/logrus"
)

func (m *SwapMonitor) MonitorSwapOut(ctx context.Context, currentSwap models.SwapOut) error {
	logger := log.WithField("id", currentSwap.SwapID)
	logger.Info("processing swap out")

	newSwap, err := m.swapClient.GetSwapOut(ctx, currentSwap.SwapID)
	switch {
	case errors.Is(err, swaps.ErrSwapNotFound):
		logger.Warn("swap not found")

		outcome := models.OutcomeFailed
		currentSwap.Outcome = &outcome
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
		logger.Debug("waiting for payment")
	case models.StatusInvoicePaymentIntentReceived:
		logger.Debug("off-chain payment detected")
	case models.StatusContractFundedUnconfirmed:
		logger.Debug("on-chain HTLC contract detected, waiting for confirmation")
		currentSwap.TimeoutBlockHeight = int64(newSwap.TimeoutBlockHeight)
	case models.StatusContractFunded:
		logger.Debug("contract funded confirmed, claiming on-chain tx")
		tx, err := m.ClaimSwapOut(ctx, &currentSwap)
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

func (m *SwapMonitor) ClaimSwapOut(ctx context.Context, swap *models.SwapOut) (string, error) {
	logger := log.WithField("id", swap.SwapID)

	logger.Infof("claiming swap out: %s", swap.SwapID)
	res, err := m.swapClient.GetClaimPSBT(ctx, swap.SwapID, swap.DestinationAddress)
	if err != nil {
		return "", err
	}

	// Get psbt from response
	pkt, err := bitcoin.Base64ToPsbt(res.PSBT)
	if err != nil {
		return "", fmt.Errorf("failed to parse PSBT: %w", err)
	}

	privateKey, err := bitcoin.DeserializePrivateKey(swap.ClaimPrivateKey)
	if err != nil {
		return "", fmt.Errorf("failed to decode claim private key: %w", err)
	}

	// Process the PSBT
	tx, err := bitcoin.SignFinishExtractPSBT(logger, pkt, privateKey, swap.PreImage, 0)
	if err != nil {
		return "", fmt.Errorf("failed to process PSBT: %w", err)
	}

	serializedTx, err := bitcoin.SerializeTx(tx)
	if err != nil {
		return "", fmt.Errorf("failed to serialize transaction: %w", err)
	}

	// Send transaction back to the swap client
	logger.Debug("sending transaction back to swap client")
	err = m.swapClient.PostClaim(ctx, swap.SwapID, serializedTx)
	if err != nil {
		return "", err
	}

	return tx.TxID(), nil
}
