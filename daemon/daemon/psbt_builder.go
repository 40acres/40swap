package daemon

import (
	"context"
	"encoding/hex"
	"fmt"

	"github.com/40acres/40swap/daemon/bitcoin"
	"github.com/40acres/40swap/daemon/database/models"
	"github.com/40acres/40swap/daemon/lightning"
	swaps "github.com/40acres/40swap/daemon/swaps"
	"github.com/btcsuite/btcd/btcutil/psbt"
	"github.com/lightningnetwork/lnd/lntypes"
	log "github.com/sirupsen/logrus"
)

// PSBTBuilder contains methods for building PSBTs locally for both refund and claim transactions
type PSBTBuilder struct {
	bitcoin bitcoin.Client
	network lightning.Network
}

// NewPSBTBuilder creates a new PSBT builder instance
func NewPSBTBuilder(bitcoinClient bitcoin.Client, network lightning.Network) *PSBTBuilder {
	return &PSBTBuilder{
		bitcoin: bitcoinClient,
		network: network,
	}
}

// BuildRefundPSBT builds a refund PSBT locally for swap in transactions
func (p *PSBTBuilder) BuildRefundPSBT(ctx context.Context, swap *models.SwapIn, feeRate int64, logger *log.Entry) (*psbt.Packet, error) {
	logger.Info("Attempting to build refund PSBT locally")

	// Decode the redeem script
	lockScript, err := hex.DecodeString(swap.RedeemScript)
	if err != nil {
		return nil, fmt.Errorf("failed to decode redeem script: %w", err)
	}

	// Get lock transaction
	lockTx, err := p.bitcoin.GetTxFromTxID(ctx, swap.LockTxID)
	if err != nil {
		return nil, fmt.Errorf("failed to get lock transaction: %w", err)
	}

	// Build PSBT locally
	pkt, err := bitcoin.BuildTransactionWithFee(feeRate, func(feeAmount int64, isFeeCalculationRun bool) (*psbt.Packet, error) {
		psbt, err := bitcoin.BuildContractSpendBasePsbt(swap.ClaimAddress, swap.RefundAddress, lockScript, lockTx, feeAmount, p.network)
		if err != nil {
			return nil, err
		}
		psbt.UnsignedTx.LockTime = uint32(swap.TimeoutBlockHeight)

		// Only sign during fee calculation run to estimate fees
		if isFeeCalculationRun {
			privateKey, err := bitcoin.ParsePrivateKey(swap.RefundPrivatekey)
			if err != nil {
				return nil, fmt.Errorf("failed to decode refund private key: %w", err)
			}

			// Sign with empty preimage for refund (fee calculation only)
			// We can sign the original psbt for fee calculation since we'll rebuild it anyway
			_, err = bitcoin.SignFinishExtractPSBT(logger, psbt, privateKey, &lntypes.Preimage{}, 0)
			if err != nil {
				return nil, fmt.Errorf("failed to sign PSBT for fee calculation: %w", err)
			}
		}

		return psbt, nil
	})

	if err != nil {
		return nil, fmt.Errorf("failed to build PSBT: %w", err)
	}

	logger.Info("Successfully built refund PSBT locally")
	return pkt, nil
}

// BuildClaimPSBT builds a claim PSBT locally for swap out transactions
func (p *PSBTBuilder) BuildClaimPSBT(ctx context.Context, swap *models.SwapOut, swapInfo *swaps.SwapOutResponse, feeRate int64, logger *log.Entry) (*psbt.Packet, error) {
	logger.Info("Attempting to build claim PSBT locally")

	// Check if we have the required fields for local construction
	if swap.ContractAddress == nil || *swap.ContractAddress == "" {
		return nil, fmt.Errorf("contract address not available for local construction")
	}

	if swap.RefundPublicKey == nil || *swap.RefundPublicKey == "" {
		return nil, fmt.Errorf("refund public key not available for local construction")
	}

	if swap.PreImage == nil {
		return nil, fmt.Errorf("preimage not available")
	}

	// Get lock transaction from the blockchain
	lockTx, err := p.bitcoin.GetTxFromTxID(ctx, *swapInfo.LockTx)
	if err != nil {
		return nil, fmt.Errorf("failed to get lock transaction: %w", err)
	}

	// Get the claim private key
	claimPrivateKey, err := bitcoin.ParsePrivateKey(swap.ClaimPrivateKey)
	if err != nil {
		return nil, fmt.Errorf("failed to decode claim private key: %w", err)
	}

	// Get preimage hash from the preimage
	preimageHash := swap.PreImage.Hash()

	// Get public keys
	claimPublicKey := claimPrivateKey.PubKey().SerializeCompressed()

	// Decode refund public key from hex
	refundPublicKey, err := hex.DecodeString(*swap.RefundPublicKey)
	if err != nil {
		return nil, fmt.Errorf("failed to decode refund public key: %w", err)
	}

	// Build the redeem script using ReverseSwapScript
	redeemScript, err := bitcoin.ReverseSwapScript(
		preimageHash[:],
		claimPublicKey,
		refundPublicKey,
		int(swapInfo.TimeoutBlockHeight),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to build redeem script: %w", err)
	}

	// Build PSBT locally using the two-pass fee calculation
	pkt, err := bitcoin.BuildTransactionWithFee(feeRate, func(feeAmount int64, isFeeCalculationRun bool) (*psbt.Packet, error) {
		psbt, err := bitcoin.BuildContractSpendBasePsbt(*swap.ContractAddress, swap.DestinationAddress, redeemScript, lockTx, feeAmount, p.network)
		if err != nil {
			return nil, err
		}

		// Only sign during fee calculation run to estimate fees
		if isFeeCalculationRun {
			// For claim transactions, we use the actual preimage (not empty)
			_, err = bitcoin.SignFinishExtractPSBT(logger, psbt, claimPrivateKey, swap.PreImage, 0)
			if err != nil {
				return nil, fmt.Errorf("failed to sign PSBT for fee calculation: %w", err)
			}
		}

		return psbt, nil
	})

	if err != nil {
		return nil, fmt.Errorf("failed to build claim transaction: %w", err)
	}

	logger.Info("Successfully built claim PSBT locally")
	return pkt, nil
}

// SignAndBroadcastPSBT signs a PSBT and broadcasts it to the Bitcoin network
func (p *PSBTBuilder) SignAndBroadcastPSBT(ctx context.Context, pkt *psbt.Packet, privateKey string, preimage *lntypes.Preimage, logger *log.Entry) (string, error) {
	// Parse private key
	key, err := bitcoin.ParsePrivateKey(privateKey)
	if err != nil {
		return "", fmt.Errorf("failed to decode private key: %w", err)
	}

	// Process the PSBT
	tx, err := bitcoin.SignFinishExtractPSBT(logger, pkt, key, preimage, 0)
	if err != nil {
		return "", fmt.Errorf("failed to sign PSBT: %w", err)
	}

	serializedTx, err := bitcoin.SerializeTx(tx)
	if err != nil {
		return "", fmt.Errorf("failed to serialize transaction: %w", err)
	}

	// Broadcast directly to bitcoin network
	logger.Debug("Broadcasting transaction directly to bitcoin network")
	err = p.bitcoin.PostRefund(ctx, serializedTx)
	if err != nil {
		return "", fmt.Errorf("failed to broadcast transaction: %w", err)
	}

	return tx.TxID(), nil
}
