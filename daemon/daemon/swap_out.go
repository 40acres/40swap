package daemon

import (
	"bytes"
	"context"
	"encoding/hex"
	"fmt"

	"github.com/40acres/40swap/daemon/bitcoin"
	"github.com/40acres/40swap/daemon/database/models"
	"github.com/btcsuite/btcd/btcec/v2"
	"github.com/btcsuite/btcd/btcutil/psbt"
	"github.com/btcsuite/btcd/txscript"
	"github.com/btcsuite/btcd/wire"
	"github.com/lightningnetwork/lnd/lntypes"
	log "github.com/sirupsen/logrus"
)

func (m *SwapMonitor) ClaimSwapOut(ctx context.Context, swap *models.SwapOut) error {
	logger := log.WithFields(log.Fields{
		"swap_id": swap.SwapID,
	})

	logger.Infof("Claiming swap out: %s", swap.SwapID)
	res, err := m.swapClient.GetClaimPSBT(ctx, swap.SwapID, swap.DestinationAddress)
	if err != nil {
		return err
	}

	// Get psbt from response
	pkt, err := bitcoin.Base64ToPsbt(res.PSBT)
	if err != nil {
		return err
	}

	privateKeyBytes, err := hex.DecodeString(swap.ClaimPrivateKey)
	if err != nil {
		return fmt.Errorf("failed to decode claim private key: %w", err)
	}
	// Deserialize the private key
	privateKey, _ := btcec.PrivKeyFromBytes(privateKeyBytes)

	input := &pkt.Inputs[0]
	fetcher := txscript.NewCannedPrevOutputFetcher(
		input.WitnessUtxo.PkScript,
		input.WitnessUtxo.Value,
	)

	// Sign transaction
	logger.Debug("Signing transaction")
	sig, err := signPSBT(pkt, privateKey, fetcher)
	if err != nil {
		return fmt.Errorf("failed to sign PSBT: %w", err)
	}

	// Add witness to the input
	logger.Debug("Adding witness to input")
	err = addWitness(input, sig, swap.PreImage)
	if err != nil {
		return fmt.Errorf("failed to add witness: %w", err)
	}

	// Finalize the PSBT
	logger.Debug("Finalizing PSBT")
	err = finalizePSBT(pkt)
	if err != nil {
		return fmt.Errorf("failed to finalize PSBT: %w", err)
	}

	tx, err := psbt.Extract(pkt)
	if err != nil {
		return fmt.Errorf("failed to extract transaction from PSBT: %w", err)
	}

	// Verify inputs
	logger.Debug("Verifying inputs")
	err = bitcoin.VerifyInputs(pkt, tx, txscript.NewTxSigHashes(tx, fetcher), fetcher)
	if err != nil {
		return fmt.Errorf("failed to verify inputs: %w", err)
	}

	txBuffer := bytes.NewBuffer(nil)
	err = tx.Serialize(txBuffer)
	if err != nil {
		return fmt.Errorf("failed to serialize transaction: %w", err)
	}

	txHex := hex.EncodeToString(txBuffer.Bytes())

	// Send transaction back to the swap client
	logger.Debug("Sending transaction back to swap client")
	_, err = m.swapClient.PostClaim(ctx, swap.SwapID, txHex)
	if err != nil {
		return err
	}

	// Save the transaction ID
	swap.TxID = tx.TxID()

	return nil
}

func signPSBT(pkt *psbt.Packet, privateKey *btcec.PrivateKey, fetcher txscript.PrevOutputFetcher) ([]byte, error) {
	// Add the sighash type to the input
	pkt.Inputs[0].SighashType = txscript.SigHashAll

	// Signing the input
	sig, err := bitcoin.SignInput(pkt, 0, privateKey, txscript.SigHashAll, fetcher)
	if err != nil {
		return nil, fmt.Errorf("failed to sign input: %v", err)
	}

	return sig, nil
}

func addWitness(input *psbt.PInput, sig []byte, preimage *lntypes.Preimage) error {
	// This is a P2WSH HTLC Spend, positions:
	// 0: Signature
	// 1: Preimage
	// 2: HTLC Script
	witness := wire.TxWitness{
		sig,
		(*preimage)[:],
		input.WitnessScript,
	}

	var buf bytes.Buffer
	err := psbt.WriteTxWitness(&buf, witness)
	if err != nil {
		return fmt.Errorf("failed to write witness: %w", err)
	}

	input.FinalScriptWitness = buf.Bytes()

	return nil
}

func finalizePSBT(pkt *psbt.Packet) error {
	// Finalize the PSBT
	ok, err := psbt.MaybeFinalize(pkt, 0)
	if err != nil {
		return fmt.Errorf("failed to finalize PSBT: %w", err)
	}
	if !ok {
		return fmt.Errorf("failed to finalize PSBT")
	}

	// Checks
	if !pkt.IsComplete() {
		return fmt.Errorf("PSBT is not complete")
	}

	err = pkt.SanityCheck()
	if err != nil {
		return fmt.Errorf("failed PSBT sanity check: %w", err)
	}

	return nil
}
