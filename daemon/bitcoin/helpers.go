package bitcoin

import (
	"bytes"
	"encoding/base64"
	"errors"
	"fmt"

	"github.com/btcsuite/btcd/btcec/v2"
	"github.com/btcsuite/btcd/btcec/v2/ecdsa"
	"github.com/btcsuite/btcd/btcutil/psbt"
	"github.com/btcsuite/btcd/txscript"
	"github.com/btcsuite/btcd/wire"
)

func SignInput(packet *psbt.Packet, inputIndex int, key *btcec.PrivateKey, sigHashType txscript.SigHashType, fetcher txscript.PrevOutputFetcher) ([]byte, error) {
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

	valid := signature.Verify(sigHash, key.PubKey())
	if !valid {
		return nil, fmt.Errorf("signature verification failed: %w", err)
	}

	return sigWithHashType, nil
}

// verifies if the inputs are valid and can be spent
func VerifyInputs(pkt *psbt.Packet, tx *wire.MsgTx, hashCache *txscript.TxSigHashes, prevoutFetcher txscript.PrevOutputFetcher) error {
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
	psbtBytes, err := base64.StdEncoding.DecodeString(base64Psbt)
	if err != nil {
		return nil, fmt.Errorf("failed to decode base64 PSBT: %w", err)
	}

	// Deserialize into a PSBT packet
	packet, err := psbt.NewFromRawBytes(bytes.NewReader(psbtBytes), false)
	if err != nil {
		return nil, fmt.Errorf("failed to parse PSBT: %w", err)
	}

	return packet, nil
}
