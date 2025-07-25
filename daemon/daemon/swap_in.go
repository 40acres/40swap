package daemon

import (
	"bytes"
	"context"
	"encoding/hex"
	"errors"
	"fmt"

	"github.com/40acres/40swap/daemon/bitcoin"
	"github.com/40acres/40swap/daemon/database/models"
	"github.com/40acres/40swap/daemon/lightning"
	"github.com/40acres/40swap/daemon/swaps"
	"github.com/btcsuite/btcd/wire"
	"github.com/lightningnetwork/lnd/lntypes"
	"github.com/lightningnetwork/lnd/zpay32"

	log "github.com/sirupsen/logrus"
)

func (m *SwapMonitor) MonitorSwapIn(ctx context.Context, currentSwap *models.SwapIn) error {
	logger := log.WithField("id", currentSwap.SwapID)
	logger.Info("processing swap")

	newSwap, err := m.swapClient.GetSwapIn(ctx, currentSwap.SwapID)
	switch {
	case errors.Is(err, swaps.ErrSwapNotFound):
		logger.Warn("swap not found")

		outcome := models.OutcomeFailed
		currentSwap.Outcome = &outcome
		currentSwap.Status = models.StatusDone

		err := m.repository.SaveSwapIn(ctx, currentSwap)
		if err != nil {
			return fmt.Errorf("failed to save swap in: %w", err)
		}

		return nil
	case err != nil:
		return fmt.Errorf("failed to get swap in: %w", err)
	}

	newStatus := models.SwapStatus(newSwap.Status)
	changed := currentSwap.Status != newStatus

	// Update contract information from backend if available
	contractChanged := false
	if newSwap.RedeemScript != "" && currentSwap.RedeemScript != newSwap.RedeemScript {
		currentSwap.RedeemScript = newSwap.RedeemScript
		currentSwap.ClaimAddress = newSwap.ContractAddress
		contractChanged = true
		logger.Debugf("Updated redeem script: %s", newSwap.RedeemScript)
		logger.Debugf("Updated claim address (contract address): %s", newSwap.ContractAddress)
	}
	if newSwap.TimeoutBlockHeight > 0 {
		timeoutBlockHeight := int64(newSwap.TimeoutBlockHeight)
		if currentSwap.TimeoutBlockHeight != timeoutBlockHeight {
			currentSwap.TimeoutBlockHeight = timeoutBlockHeight
			contractChanged = true
			logger.Debugf("Updated timeout block height: %d", newSwap.TimeoutBlockHeight)
		}
	}

	switch newStatus {
	case models.StatusCreated:
		// Do nothing
		logger.Debug("waiting for payment")
	case models.StatusContractFundedUnconfirmed:
		if newSwap.LockTx != nil {
			txId, err := getTxId(*newSwap.LockTx)
			if err != nil {
				return fmt.Errorf("failed to get tx id: %w", err)
			}
			currentSwap.LockTxID = txId
		}
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
			preimage, err := m.getPreimage(ctx, currentSwap.PaymentRequest)
			if err != nil {
				return fmt.Errorf("failed to get preimage: %w", err)
			}

			currentSwap.PreImage = preimage
		}
	case models.StatusContractRefundedUnconfirmed:
		log.Debug("the refund has been sent, waiting for on-chain confirmation")
	case models.StatusContractExpired:
		if currentSwap.RefundRequestedAt.IsZero() { // check refund was requested
			currentSwap.RefundRequestedAt = m.now()
			log.Info("on-chain contract expired. initiating a refund")
			txId, err := m.InitiateRefund(ctx, currentSwap)
			if err != nil {
				return fmt.Errorf("failed to initiate refund: %w", err)
			}
			currentSwap.RefundTxID = txId
		} else {
			log.Debug("on-chain contract expired. Refund is in-progress")
		}
	}

	if changed || contractChanged {
		currentSwap.Status = newStatus
		err := m.repository.SaveSwapIn(ctx, currentSwap)
		if err != nil {
			return fmt.Errorf("failed to save swap in: %w", err)
		}
	}

	logger.Debug("swap in processed")

	return nil
}

func (m *SwapMonitor) InitiateRefund(ctx context.Context, swap *models.SwapIn) (string, error) {
	logger := log.WithFields(log.Fields{
		"swap_id": swap.SwapID,
	})

	logger.Infof("Claiming swap in refund: %s", swap.SwapID)

	// Get recommended fee rate
	recommendedFeeRate, err := m.bitcoin.GetRecommendedFees(ctx, bitcoin.HalfHourFee)
	if err != nil {
		return "", fmt.Errorf("failed to get recommended fees: %w", err)
	}

	if recommendedFeeRate > 200 {
		return "", fmt.Errorf("recommended fee rate is too high: %d", recommendedFeeRate)
	}

	// If we don't have the lock transaction ID, try to get it from backend
	if swap.LockTxID == "" {
		logger.Debug("Lock transaction ID not available locally, fetching from backend")

		backendSwap, err := m.swapClient.GetSwapIn(ctx, swap.SwapID)
		if err != nil {
			return "", fmt.Errorf("failed to get swap from backend: %w", err)
		}

		if backendSwap.LockTx != nil {
			txId, err := getTxId(*backendSwap.LockTx)
			if err != nil {
				return "", fmt.Errorf("failed to get tx id from backend data: %w", err)
			}
			swap.LockTxID = txId
			logger.Debugf("Retrieved lock transaction ID from backend: %s", txId)

			// Save the updated swap with the lock transaction ID
			err = m.repository.SaveSwapIn(ctx, swap)
			if err != nil {
				return "", fmt.Errorf("failed to save swap with lock tx id: %w", err)
			}
		}

		// Still no lock transaction ID after checking backend
		if swap.LockTxID == "" {
			return "", fmt.Errorf("lock transaction ID not available for local construction (not found in backend either)")
		}
	}

	psbtBuilder := NewPSBTBuilder(m.bitcoin, m.network)

	pkt, err := psbtBuilder.BuildRefundPSBT(ctx, swap, recommendedFeeRate, logger)
	if err != nil {
		return "", fmt.Errorf("failed to build refund PSBT: %w", err)
	}

	// Sign and broadcast the PSBT
	txID, err := psbtBuilder.SignAndBroadcastPSBT(ctx, pkt, swap.RefundPrivatekey, &lntypes.Preimage{}, logger)
	if err != nil {
		return "", fmt.Errorf("failed to sign and broadcast refund transaction: %w", err)
	}

	return txID, nil
}

func (m *SwapMonitor) getPreimage(ctx context.Context, paymentRequest string) (*lntypes.Preimage, error) {
	invoice, err := zpay32.Decode(paymentRequest, lightning.ToChainCfgNetwork(m.network))
	if err != nil {
		return nil, fmt.Errorf("failed to decode invoice: %w", err)
	}
	p, err := m.lightningClient.MonitorPaymentReception(ctx, invoice.PaymentHash[:])
	if err != nil {
		return nil, fmt.Errorf("failed to get invoice preimage from node: %w", err)
	}
	preimage, err := lntypes.MakePreimageFromStr(p)
	if err != nil {
		return nil, fmt.Errorf("failed to convert preimage: %w", err)
	}

	return &preimage, nil
}

func getTxId(tx string) (string, error) {
	if tx == "" {
		return "", nil
	}

	// If PSBT parsing fails, try to parse as raw hex transaction
	txBytes, err := hex.DecodeString(tx)
	if err != nil {
		return "", fmt.Errorf("failed to decode hex transaction: %w", err)
	}

	transaction := wire.NewMsgTx(wire.TxVersion)
	err = transaction.Deserialize(bytes.NewReader(txBytes))
	if err != nil {
		return "", fmt.Errorf("failed to deserialize transaction: %w", err)
	}

	return transaction.TxHash().String(), nil
}
