package bitcoin

import (
	"bytes"
	"encoding/hex"
	"errors"
	"fmt"

	"github.com/40acres/40swap/daemon/lightning"
	"github.com/btcsuite/btcd/btcec/v2"
	"github.com/btcsuite/btcd/btcec/v2/ecdsa"
	"github.com/btcsuite/btcd/btcutil/psbt"
	"github.com/btcsuite/btcd/txscript"
	"github.com/btcsuite/btcd/wire"
	"github.com/lightningnetwork/lnd/lntypes"
	log "github.com/sirupsen/logrus"
)

func signInput(packet *psbt.Packet, inputIndex int, key *btcec.PrivateKey, sigHashType txscript.SigHashType, fetcher txscript.PrevOutputFetcher) ([]byte, error) {
	if inputIndex < 0 || inputIndex >= len(packet.Inputs) {
		return nil, fmt.Errorf("invalid input index: %d", inputIndex)
	}

	input := &packet.Inputs[inputIndex]

	sigHashes := txscript.NewTxSigHashes(packet.UnsignedTx, fetcher)
	sigHash, err := txscript.CalcWitnessSigHash(
		input.WitnessScript,
		sigHashes,
		sigHashType,
		packet.UnsignedTx,
		inputIndex,
		input.WitnessUtxo.Value,
	)
	if err != nil {
		return nil, err
	}

	signature := ecdsa.Sign(key, sigHash)
	sigWithHashType := append(signature.Serialize(), byte(sigHashType))

	return sigWithHashType, nil
}

// verifies if the inputs are valid and can be spent
func verifyInputs(pkt *psbt.Packet, tx *wire.MsgTx, hashCache *txscript.TxSigHashes, prevoutFetcher txscript.PrevOutputFetcher) error {
	for i := range pkt.Inputs {
		lockupTxOutput := pkt.Inputs[i].WitnessUtxo

		// Create a script engine to validate
		vm, err := txscript.NewEngine(lockupTxOutput.PkScript,
			tx, i, txscript.StandardVerifyFlags, nil, hashCache, lockupTxOutput.Value, prevoutFetcher)
		if err != nil {
			return fmt.Errorf("failed to create script engine: %w", err)
		}

		err = vm.Execute()
		var scriptErr *txscript.Error
		if err != nil {
			if errors.As(err, &scriptErr) {
				return fmt.Errorf("input %d: script error: %s desc: %s", i, scriptErr.ErrorCode, scriptErr.Description)
			} else {
				return fmt.Errorf("input %d: error executing script: %w", i, err)
			}
		}
	}

	return nil
}

func Base64ToPsbt(base64Psbt string) (*psbt.Packet, error) {
	// Deserialize into a PSBT packet
	packet, err := psbt.NewFromRawBytes(bytes.NewReader([]byte(base64Psbt)), true)
	if err != nil {
		return nil, fmt.Errorf("failed to parse PSBT: %w", err)
	}

	return packet, nil
}

func signPSBT(pkt *psbt.Packet, privateKey *btcec.PrivateKey, fetcher txscript.PrevOutputFetcher) ([]byte, error) {
	// Add the sighash type to the input
	pkt.Inputs[0].SighashType = txscript.SigHashAll

	// Signing the input
	sig, err := signInput(pkt, 0, privateKey, txscript.SigHashAll, fetcher)
	if err != nil {
		return nil, fmt.Errorf("failed to sign input: %w", err)
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

func SignFinishExtractPSBT(logger *log.Entry, pkt *psbt.Packet, privateKey *btcec.PrivateKey, preimage *lntypes.Preimage, inputIndex int) (*wire.MsgTx, error) {
	input := &pkt.Inputs[inputIndex]

	fetcher := txscript.NewCannedPrevOutputFetcher(
		input.WitnessUtxo.PkScript,
		input.WitnessUtxo.Value,
	)

	// Sign transaction
	logger.Debug("Signing transaction")
	sig, err := signPSBT(pkt, privateKey, fetcher)
	if err != nil {
		return nil, fmt.Errorf("failed to sign PSBT: %w", err)
	}

	// Add witness to the input
	logger.Debug("Adding witness to input")
	err = addWitness(input, sig, preimage)
	if err != nil {
		return nil, fmt.Errorf("failed to add witness: %w", err)
	}

	// Finalize the PSBT
	logger.Debug("Finalizing PSBT")
	err = finalizePSBT(pkt)
	if err != nil {
		return nil, fmt.Errorf("failed to finalize PSBT: %w", err)
	}

	tx, err := psbt.Extract(pkt)
	if err != nil {
		return nil, fmt.Errorf("failed to extract transaction from PSBT: %w", err)
	}

	// Verify inputs
	logger.Debug("Verifying inputs")
	err = verifyInputs(pkt, tx, txscript.NewTxSigHashes(tx, fetcher), fetcher)
	if err != nil {
		return nil, fmt.Errorf("failed to verify inputs: %w", err)
	}

	return tx, nil
}

// Serializes a transaction into a hex string
func SerializeTx(tx *wire.MsgTx) (string, error) {
	txBuffer := bytes.NewBuffer(nil)
	err := tx.Serialize(txBuffer)
	if err != nil {
		return "", fmt.Errorf("failed to serialize transaction: %w", err)
	}

	return hex.EncodeToString(txBuffer.Bytes()), nil
}

// ParsePrivateKey string into a btcec.PrivateKey
func ParsePrivateKey(privKey string) (*btcec.PrivateKey, error) {
	privateKeyBytes, err := hex.DecodeString(privKey)
	if err != nil {
		return nil, fmt.Errorf("failed to decode refund private key: %w", err)
	}

	// Deserialize the private key
	privateKey, _ := btcec.PrivKeyFromBytes(privateKeyBytes)

	return privateKey, nil
}

// PSBTHasValidOutputAddress checks if the PSBT is valid by comparing the
// output address in the PSBT with the provided address.
func PSBTHasValidOutputAddress(psbt *psbt.Packet, network lightning.Network, address string) bool {
	cfgnetwork := lightning.ToChainCfgNetwork(network)

	outs := psbt.UnsignedTx.TxOut
	if len(outs) != 1 {
		return false
	}
	_, addrs, _, err := txscript.ExtractPkScriptAddrs(outs[0].PkScript, cfgnetwork)
	if err != nil || len(addrs) != 1 {
		return false
	}

	return addrs[0].EncodeAddress() == address
}

// IsValidOutpoint checks if the outpoint is valid by parsing it and checking the format.
func IsValidOutpoint(outpoint string) bool {
	_, err := wire.NewOutPointFromString(outpoint)

	return err == nil
}

// ParseOutpoint parses an outpoint string in the format "txid:vout" and returns the txid and vout as separate values.
func ParseOutpoint(outpoint string) (string, int, error) {
	opt, err := wire.NewOutPointFromString(outpoint)
	if err != nil {
		return "", 0, fmt.Errorf("failed to parse outpoint: %w", err)
	}
	txid := opt.Hash.String()
	intVOut := opt.Index

	return txid, int(intVOut), nil
}
