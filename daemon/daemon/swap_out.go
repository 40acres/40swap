package daemon

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/40acres/40swap/daemon/bitcoin"
	"github.com/40acres/40swap/daemon/database/models"
	"github.com/40acres/40swap/daemon/swaps"
	"github.com/btcsuite/btcd/btcec/v2"
	"github.com/btcsuite/btcd/btcutil/psbt"
	"github.com/btcsuite/btcd/wire"
	decodepay "github.com/nbd-wtf/ln-decodepay"
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
		offchainFees, onchainFees, err := m.GetFeesSwapOut(&currentSwap)
		if err != nil {
			return fmt.Errorf("failed to get fees: %w", err)
		}
		currentSwap.OffchainFeeSats = int64(offchainFees)
		currentSwap.OnchainFeeSats = int64(onchainFees)
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
	pkt, err := psbt.NewFromRawBytes(bytes.NewReader([]byte(res.PSBT)), true)
	if err != nil {
		return "", fmt.Errorf("failed to parse PSBT: %w", err)
	}

	privateKeyBytes, err := hex.DecodeString(swap.ClaimPrivateKey)
	if err != nil {
		return "", fmt.Errorf("failed to decode claim private key: %w", err)
	}
	// Deserialize the private key
	privateKey, _ := btcec.PrivKeyFromBytes(privateKeyBytes)

	// Process the PSBT
	tx, err := bitcoin.SignFinishExtractPSBT(logger, pkt, privateKey, swap.PreImage, 0)
	if err != nil {
		return "", fmt.Errorf("failed to process PSBT: %w", err)
	}

	serializedTx, err := serializePSBT(tx)
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

func (m *SwapMonitor) GetFeesSwapOut(swap *models.SwapOut) (uint64, uint64, error) {
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
	c := http.Client{}
	resp, err := c.Get(fmt.Sprintf("/api/tx/%s", swap.TxID))
	if err != nil {
		return 0, 0, fmt.Errorf("failed to get transaction from mempool: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return 0, 0, fmt.Errorf("failed to get transaction from mempool: %s", resp.Status)
	}

	var txInfo map[string]any
	err = json.NewDecoder(resp.Body).Decode(&txInfo)
	if err != nil {
		return 0, 0, fmt.Errorf("failed to decode transaction info: %w", err)
	}
	// Get the fee from the transaction info
	onchainFees, ok := txInfo["fee"].(uint64)
	if !ok {
		return 0, 0, fmt.Errorf("failed to get fee from transaction info")
	}

	return uint64(offchainFees), onchainFees, nil
}

func serializePSBT(tx *wire.MsgTx) (string, error) {
	txBuffer := bytes.NewBuffer(nil)
	err := tx.Serialize(txBuffer)
	if err != nil {
		return "", fmt.Errorf("failed to serialize transaction: %w", err)
	}

	return hex.EncodeToString(txBuffer.Bytes()), nil
}
