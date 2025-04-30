package daemon

import (
	"bytes"
	"context"
	"errors"
	"fmt"

	"github.com/40acres/40swap/daemon/bitcoin"
	"github.com/40acres/40swap/daemon/database/models"
	"github.com/40acres/40swap/daemon/lightning"
	"github.com/40acres/40swap/daemon/swaps"
	"github.com/btcsuite/btcd/btcutil/psbt"
	"github.com/lightningnetwork/lnd/lntypes"
	"github.com/lightningnetwork/lnd/zpay32"

	log "github.com/sirupsen/logrus"
)

func (m *SwapMonitor) MonitorSwapIn(ctx context.Context, currentSwap models.SwapIn) error {
	logger := log.WithField("id", currentSwap.SwapID)
	logger.Info("processing swap")

	newSwap, err := m.swapClient.GetSwapIn(ctx, currentSwap.SwapID)
	switch {
	case errors.Is(err, swaps.ErrSwapNotFound):
		logger.Warn("swap not found")

		outcome := models.OutcomeFailed
		currentSwap.Outcome = &outcome
		currentSwap.Status = models.StatusDone

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

func (m *SwapMonitor) InitiateRefund(ctx context.Context, swap models.SwapIn) (string, error) {
	logger := log.WithFields(log.Fields{
		"swap_id": swap.SwapID,
	})

	logger.Infof("Claiming swap in refund: %s", swap.SwapID)
	res, err := m.swapClient.GetRefundPSBT(ctx, swap.SwapID, swap.RefundAddress)
	if err != nil {
		return "", fmt.Errorf("failed to get refund psbt: %w", err)
	}

	pkt, err := bitcoin.Base64ToPsbt(res.PSBT)
	if err != nil {
		return "", fmt.Errorf("failed to decode psbt: %w", err)
	}

	// check if the refund address returned in the psbt is our own
	if !bitcoin.PSBTHasValidOutputAddress(pkt, m.network, swap.RefundAddress) {
		return "", fmt.Errorf("invalid refund tx")
	}

	privateKey, err := bitcoin.ParsePrivateKey(swap.RefundPrivatekey)
	if err != nil {
		return "", fmt.Errorf("failed to decode refund private key: %w", err)
	}

	// Process the PSBT
	tx, err := bitcoin.SignFinishExtractPSBT(logger, pkt, privateKey, &lntypes.Preimage{}, 0)
	if err != nil {
		return "", fmt.Errorf("failed to sign PSBT: %w", err)
	}

	if fee, err := pkt.GetTxFee(); err != nil || fee > 1000 {
		return "", fmt.Errorf("fee is too high: %d", fee)
	}

	serializedTx, err := bitcoin.SerializeTx(tx)
	if err != nil {
		return "", fmt.Errorf("failed to serialize transaction: %w", err)
	}

	// Send transaction back to the swap client
	logger.Debug("Sending transaction back to swap client")
	err = m.swapClient.PostRefund(ctx, swap.SwapID, serializedTx)
	if err != nil {
		return "", err
	}

	return tx.TxID(), nil
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

	packet, err := psbt.NewFromRawBytes(
		bytes.NewReader([]byte(tx)), false,
	)
	if err != nil {
		return "", fmt.Errorf("failed to parse PSBT: %w", err)
	}

	return packet.UnsignedTx.TxID(), nil
}
