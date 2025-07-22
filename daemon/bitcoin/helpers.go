package bitcoin

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"

	"github.com/40acres/40swap/daemon/lightning"
	"github.com/btcsuite/btcd/btcec/v2"
	"github.com/btcsuite/btcd/btcec/v2/ecdsa"
	"github.com/btcsuite/btcd/btcutil"
	"github.com/btcsuite/btcd/btcutil/psbt"
	"github.com/btcsuite/btcd/mempool"
	"github.com/btcsuite/btcd/txscript"
	"github.com/btcsuite/btcd/wire"
	"github.com/lightningnetwork/lnd/lntypes"
	log "github.com/sirupsen/logrus"
	"golang.org/x/crypto/ripemd160"
)

// BuildTransactionWithFee builds a transaction with the given fee rate by first calculating the virtual size
// and then building the final transaction with the correct fee amount.
func BuildTransactionWithFee(satsPerVbyte int64, buildFn func(feeAmount int64, isFeeCalculationRun bool) (*psbt.Packet, error)) (*psbt.Packet, error) {
	// First pass: build with a dummy fee to calculate virtual size
	tempPsbt, err := buildFn(1, true)
	if err != nil {
		return nil, fmt.Errorf("failed to build temp PSBT: %w", err)
	}

	// Extract transaction to calculate virtual size
	tempTx, err := psbt.Extract(tempPsbt)
	if err != nil {
		return nil, fmt.Errorf("failed to extract temp transaction: %w", err)
	}

	// Calculate virtual size including witness data
	virtualSize := mempool.GetTxVirtualSize(btcutil.NewTx(tempTx))
	feeAmount := int64(virtualSize) * satsPerVbyte

	// Second pass: build with the correct fee
	return buildFn(feeAmount, false)
}

// BuildContractSpendBasePsbt builds a PSBT for spending from a contract address
func BuildContractSpendBasePsbt(contractAddress, outputAddress string, lockScript []byte, spendingTx *wire.MsgTx, feeAmount int64, network lightning.Network) (*psbt.Packet, error) {
	logger := log.WithField("contractAddress", contractAddress)

	cfgNetwork := lightning.ToChainCfgNetwork(network)

	// Find the output in the spending transaction that corresponds to our contract address
	var spendingOutput *wire.TxOut
	var spendingIndex uint32
	found := false

	// For P2WSH, we need to use SHA256 hash, not Hash160
	scriptHash := sha256.Sum256(lockScript)
	expectedAddr, err := btcutil.NewAddressWitnessScriptHash(scriptHash[:], cfgNetwork)
	if err != nil {
		logger.Errorf("Failed to generate address from lock script: %v", err)

		return nil, fmt.Errorf("failed to generate address from lock script: %w", err)
	}

	logger.Debugf("Looking for contract address: %s in transaction with %d outputs", contractAddress, len(spendingTx.TxOut))

	for i, output := range spendingTx.TxOut {
		// Try to decode the script to an address for comparison
		_, addresses, _, err := txscript.ExtractPkScriptAddrs(output.PkScript, cfgNetwork)
		var outputAddr string
		if err == nil && len(addresses) > 0 {
			outputAddr = addresses[0].String()
		} else {
			continue // Skip unknown script outputs
		}

		// Compare with the provided contract address
		if outputAddr == contractAddress {
			spendingOutput = output
			spendingIndex = uint32(i) // #nosec G115 - loop index will never overflow uint32
			found = true
			logger.Debugf("Found matching output at index %d", i)

			break
		}
	}

	if !found {
		logger.Errorf("Contract address %s not found in spending transaction (expected: %s)", contractAddress, expectedAddr.String())

		return nil, fmt.Errorf("contract address %s not found in spending transaction", contractAddress)
	}

	// Check if we have enough value after fee
	outputValue := spendingOutput.Value - feeAmount
	if outputValue <= 1000 {
		return nil, fmt.Errorf("amount is too low after fee: %d", outputValue)
	}

	// Create new transaction
	tx := wire.NewMsgTx(2)

	// Add input from the spending transaction
	txIn := wire.NewTxIn(&wire.OutPoint{
		Hash:  spendingTx.TxHash(),
		Index: spendingIndex,
	}, nil, nil)
	txIn.Sequence = 0xfffffffd // Required for locktime
	tx.AddTxIn(txIn)

	// Add output to destination address
	destinationAddr, err := btcutil.DecodeAddress(outputAddress, cfgNetwork)
	if err != nil {
		return nil, fmt.Errorf("failed to decode destination address: %w", err)
	}

	outputScript, err := txscript.PayToAddrScript(destinationAddr)
	if err != nil {
		return nil, fmt.Errorf("failed to create output script: %w", err)
	}

	txOut := wire.NewTxOut(outputValue, outputScript)
	tx.AddTxOut(txOut)

	// Create PSBT
	pkt, err := psbt.NewFromUnsignedTx(tx)
	if err != nil {
		return nil, fmt.Errorf("failed to create PSBT: %w", err)
	}

	// Create p2wsh payment to get the output script
	p2wsh, err := btcutil.NewAddressWitnessScriptHash(scriptHash[:], cfgNetwork)
	if err != nil {
		return nil, fmt.Errorf("failed to create p2wsh address: %w", err)
	}

	p2wshScript, err := txscript.PayToAddrScript(p2wsh)
	if err != nil {
		return nil, fmt.Errorf("failed to create p2wsh script: %w", err)
	}

	// Add witness UTXO and witness script to the input
	pkt.Inputs[0].WitnessUtxo = &wire.TxOut{
		Value:    spendingOutput.Value,
		PkScript: p2wshScript,
	}
	pkt.Inputs[0].WitnessScript = lockScript

	return pkt, nil
}

func signInput(packet *psbt.Packet, inputIndex int, key *btcec.PrivateKey, sigHashType txscript.SigHashType, fetcher txscript.PrevOutputFetcher) ([]byte, error) {
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
	if inputIndex < 0 || inputIndex >= len(pkt.Inputs) {
		return nil, fmt.Errorf("invalid input index: %d", inputIndex)
	}

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

func BuildPSBT(spendingTxHex *wire.MsgTx, lockScript string, outpoint string, outputAddress string, feeRate, minRelayFee int64, network lightning.Network) (*psbt.Packet, error) {
	cfgnetwork := lightning.ToChainCfgNetwork(network)
	prevOut, err := wire.NewOutPointFromString(outpoint)
	if err != nil {
		return nil, fmt.Errorf("failed to parse outpoint: %w", err)
	}

	destinationAddr, err := btcutil.DecodeAddress(outputAddress, cfgnetwork)
	if err != nil {
		return nil, fmt.Errorf("failed to decode destination address: %w", err)
	}

	if len(spendingTxHex.TxOut) <= int(prevOut.Index) {
		return nil, fmt.Errorf("invalid outpoint index: %d", prevOut.Index)
	}

	amount := spendingTxHex.TxOut[prevOut.Index].Value

	tx := wire.NewMsgTx(2)

	txIn := wire.NewTxIn(prevOut, nil, nil)
	tx.AddTxIn(txIn)

	// Create the output script from the address
	outputScript, err := txscript.PayToAddrScript(destinationAddr)
	if err != nil {
		return nil, fmt.Errorf("Failed to create output script: %w", err)
	}

	txOut := wire.NewTxOut(amount, outputScript)
	tx.AddTxOut(txOut)

	// Update fee
	fee := feeRate * mempool.GetTxVirtualSize(btcutil.NewTx(tx))
	if feeRate < 135 {
		fee = minRelayFee
	}

	outputAmount := int64(amount) - fee
	tx.TxOut[0].Value = outputAmount

	pkt, err := psbt.NewFromUnsignedTx(tx)
	if err != nil {
		return nil, fmt.Errorf("failed to create new PSBT: %w", err)
	}

	pkScript := spendingTxHex.TxOut[prevOut.Index].PkScript
	prevTxOut := wire.NewTxOut(amount, pkScript)
	pkt.Inputs[0].WitnessUtxo = prevTxOut

	decodedLockScript, err := hex.DecodeString(lockScript)
	if err != nil {
		return nil, fmt.Errorf("failed to decode lock script: %w", err)
	}

	pkt.Inputs[0].WitnessScript = decodedLockScript

	pkt.UnsignedTx.TxIn[0].Sequence = 4294967293 // locktime does not work without this

	return pkt, nil
}

func GetOutputAddress(msgTx *wire.MsgTx, index int, network lightning.Network) (btcutil.Address, error) {
	cfgnetwork := lightning.ToChainCfgNetwork(network)

	pkScript := msgTx.TxOut[index].PkScript
	_, addresses, _, err := txscript.ExtractPkScriptAddrs(pkScript, cfgnetwork)
	if err != nil {
		return nil, err
	}
	if len(addresses) == 0 {
		return nil, fmt.Errorf("no address found")
	}

	return addresses[0], nil
}

// ReverseSwapScript creates the reverse swap script for swap out transactions
// This is equivalent to the reverseSwapScript function in server-backend
func ReverseSwapScript(preimageHash, claimPublicKey, refundPublicKey []byte, timeoutBlockHeight int) ([]byte, error) {
	// Create script builder
	builder := txscript.NewScriptBuilder()

	// OP_SIZE 32 OP_EQUAL
	builder.AddOp(txscript.OP_SIZE)
	builder.AddInt64(32)
	builder.AddOp(txscript.OP_EQUAL)

	// OP_IF
	builder.AddOp(txscript.OP_IF)

	// OP_HASH160 <preimage_hash160> OP_EQUALVERIFY <claim_public_key>
	preimageHash160 := Hash160(preimageHash)

	builder.AddOp(txscript.OP_HASH160)
	builder.AddData(preimageHash160)
	builder.AddOp(txscript.OP_EQUALVERIFY)
	builder.AddData(claimPublicKey)

	// OP_ELSE
	builder.AddOp(txscript.OP_ELSE)

	// OP_DROP <timeout_block_height> OP_CHECKLOCKTIMEVERIFY OP_DROP <refund_public_key>
	builder.AddOp(txscript.OP_DROP)
	builder.AddInt64(int64(timeoutBlockHeight))
	builder.AddOp(txscript.OP_CHECKLOCKTIMEVERIFY)
	builder.AddOp(txscript.OP_DROP)
	builder.AddData(refundPublicKey)

	// OP_ENDIF
	builder.AddOp(txscript.OP_ENDIF)

	// OP_CHECKSIG
	builder.AddOp(txscript.OP_CHECKSIG)

	return builder.Script()
}

// Hash160 computes RIPEMD160(SHA256(data))
func Hash160(data []byte) []byte {
	hash := sha256.Sum256(data)
	ripemd := ripemd160.New() // #nosec G406 - RIPEMD160 required for Bitcoin script compatibility
	ripemd.Write(hash[:])

	return ripemd.Sum(nil)
}
