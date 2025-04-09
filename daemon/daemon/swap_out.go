package daemon

import (
	"bytes"
	"context"
	"encoding/hex"
	"errors"
	"fmt"

	"github.com/40acres/40swap/daemon/bitcoin"
	"github.com/40acres/40swap/daemon/database/models"
	"github.com/40acres/40swap/daemon/swaps"
	"github.com/btcsuite/btcd/btcec/v2"
	"github.com/btcsuite/btcd/txscript"
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
		logger.Debug("Waiting for payment")
	case models.StatusInvoicePaymentIntentReceived:
		logger.Debug("Off-chain payment detected")
	case models.StatusContractFundedUnconfirmed:
		logger.Debug("On-chain payment detected, waiting for confirmation")
		currentSwap.TimeoutBlockHeight = int64(newSwap.TimeoutBlockHeight)
	case models.StatusContractFunded:
		logger.Debug("Contract funded confirmed, claiming on-chain tx")
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
	logger := log.WithFields(log.Fields{
		"swap_id": swap.SwapID,
	})

	logger.Infof("Claiming swap out: %s", swap.SwapID)
	res, err := m.swapClient.GetClaimPSBT(ctx, swap.SwapID, swap.DestinationAddress)
	if err != nil {
		return "", err
	}

	// Get psbt from response
	pkt, err := bitcoin.Base64ToPsbt(res.PSBT)
	if err != nil {
		return "", err
	}

	privateKeyBytes, err := hex.DecodeString(swap.ClaimPrivateKey)
	if err != nil {
		return "", fmt.Errorf("failed to decode claim private key: %w", err)
	}
	// Deserialize the private key
	privateKey, _ := btcec.PrivKeyFromBytes(privateKeyBytes)

	input := &pkt.Inputs[0]
	fetcher := txscript.NewCannedPrevOutputFetcher(
		input.WitnessUtxo.PkScript,
		input.WitnessUtxo.Value,
	)

	// Process the PSBT
	tx, err := bitcoin.ProcessPSBT(logger, pkt, privateKey, swap.PreImage, fetcher, input)
	if err != nil {
		return "", fmt.Errorf("failed to process PSBT: %w", err)
	}

	txBuffer := bytes.NewBuffer(nil)
	err = tx.Serialize(txBuffer)
	if err != nil {
		return "", fmt.Errorf("failed to serialize transaction: %w", err)
	}

	txHex := hex.EncodeToString(txBuffer.Bytes())

	// Send transaction back to the swap client
	logger.Debug("Sending transaction back to swap client")
	err = m.swapClient.PostClaim(ctx, swap.SwapID, txHex)
	if err != nil {
		return "", err
	}

	return tx.TxID(), nil
}
