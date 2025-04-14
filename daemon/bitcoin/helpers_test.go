package bitcoin

import (
	"bytes"
	"encoding/hex"
	"errors"
	"reflect"
	"testing"

	"github.com/btcsuite/btcd/btcec/v2"
	"github.com/btcsuite/btcd/btcutil/psbt"
	"github.com/btcsuite/btcd/chaincfg/chainhash"
	"github.com/btcsuite/btcd/txscript"
	"github.com/btcsuite/btcd/wire"
	"github.com/lightningnetwork/lnd/lntypes"
	log "github.com/sirupsen/logrus"
	"github.com/stretchr/testify/require"
)

var psbtExample = "cHNidP8BAH0CAAAAAbxLLf9+AYfqfF69QAQuETnL6cas7GDiWBZF+3xxc/Y/AAAAAAD+////AofWEgAAAAAAIgAgvGKLsRKUcp0qk/lkYWpzGJQi51RkG5J51NwHb6B6Hh+1If0jAQAAABYAFL+6THEGhybJnOkFGSRFbtCcPOG8AAAAAAABAR8wBBAkAQAAABYAFHemJ11XF7CU7WXBIJLD/qZF+6jrAAAA"
var pkt, _ = psbt.NewFromRawBytes(bytes.NewReader([]byte(psbtExample)), true)

var unfinishedPsbt = "cHNidP8BAFICAAAAAUTUQqhi4jZ+IYm4I2z9SXwcM4fTFsTg5FmkG10jirupAQAAAAD9////Ac8IAwAAAAAAFgAUfA20aAzorvbl9UnLmcHIbLQKEhYrAQAAAAEBK1gJAwAAAAAAIgAgKlsk+PAa0gJOclmBE+EoInvLFv0ODlOqT6Sqoz6+LQABBWmCASCHY6kUkO16DsaBr8sYpei09eaYcY2634WIIQIbyEJ+n1u1sEnahSXSbWKvnIRFJfKH3HxGYjRWJQ0Jbmd1AisBsXUhA5a4mglS1cVIS9NkYK2gOfwCKP8Qit+3/LajkZ4lMX/faKwAAA=="
var unfinishedPkt, _ = psbt.NewFromRawBytes(bytes.NewReader([]byte(unfinishedPsbt)), true)
var finishedPsbt = "cHNidP8BAFICAAAAAUTUQqhi4jZ+IYm4I2z9SXwcM4fTFsTg5FmkG10jirupAQAAAAD9////Ac8IAwAAAAAAFgAUfA20aAzorvbl9UnLmcHIbLQKEhYrAQAAAAEBK1gJAwAAAAAAIgAgKlsk+PAa0gJOclmBE+EoInvLFv0ODlOqT6Sqoz6+LQABCNUDSDBFAiEA5uPpzcs9/Fkbp66VYksQd+HbkkPkULWNe+MmanFDBikCIHU9SylR3/Dy31jhTHAeNqmJn6DWaU09d7nelgOIEzImASAOs5Rsp1Ug0xQGij9B64i+wtHNj3P3anetxXinzRQcXmmCASCHY6kUkO16DsaBr8sYpei09eaYcY2634WIIQIbyEJ+n1u1sEnahSXSbWKvnIRFJfKH3HxGYjRWJQ0Jbmd1AisBsXUhA5a4mglS1cVIS9NkYK2gOfwCKP8Qit+3/LajkZ4lMX/faKwAAA=="
var finishedPkt, _ = psbt.NewFromRawBytes(bytes.NewReader([]byte(finishedPsbt)), true)
var privKeyBytes, _ = hex.DecodeString("bde48e15ae57a00bbf7db477f007061619d7177fd50387d65bcb0f5884c2dc4b")
var privKey, _ = btcec.PrivKeyFromBytes(privKeyBytes)
var preimage, _ = lntypes.MakePreimageFromStr("0eb3946ca75520d314068a3f41eb88bec2d1cd8f73f76a77adc578a7cd141c5e")

func TestSignInput(t *testing.T) {
	invalidPkt := *pkt
	unsignedTx := *pkt.UnsignedTx
	unsignedTx.TxIn = []*wire.TxIn{}
	unsignedTx.TxOut = []*wire.TxOut{}
	invalidPkt.UnsignedTx = &unsignedTx

	type args struct {
		packet      *psbt.Packet
		inputIndex  int
		key         *btcec.PrivateKey
		sigHashType txscript.SigHashType
		fetcher     txscript.PrevOutputFetcher
	}
	tests := []struct {
		name    string
		args    args
		want    []byte
		wantErr bool
		err     error
	}{
		{
			name: "valid signature",
			args: args{
				packet:      pkt,
				inputIndex:  0,
				key:         &btcec.PrivateKey{},
				sigHashType: txscript.SigHashAll,
				fetcher:     txscript.NewCannedPrevOutputFetcher(pkt.Inputs[0].WitnessUtxo.PkScript, pkt.Inputs[0].WitnessUtxo.Value),
			},
			want:    []byte{48, 69, 2, 33, 0, 217, 180, 175, 165, 244, 236, 88, 226, 35, 141, 254, 179, 162, 244, 169, 202, 217, 128, 190, 111, 38, 210, 38, 202, 238, 196, 230, 158, 132, 176, 219, 78, 2, 32, 23, 32, 126, 167, 142, 46, 144, 5, 148, 77, 207, 181, 9, 157, 207, 219, 145, 185, 236, 108, 49, 101, 97, 233, 205, 76, 55, 250, 58, 25, 50, 34, 1},
			wantErr: false,
			err:     nil,
		},
		{
			name: "invalid PSBT",
			args: args{
				packet:      &invalidPkt,
				inputIndex:  0,
				key:         privKey,
				sigHashType: txscript.SigHashAll,
				fetcher:     txscript.NewCannedPrevOutputFetcher(pkt.Inputs[0].WitnessUtxo.PkScript, pkt.Inputs[0].WitnessUtxo.Value),
			},
			want:    nil,
			wantErr: true,
			err:     errors.New("idx 0 but 0 txins"),
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := signInput(tt.args.packet, tt.args.inputIndex, tt.args.key, tt.args.sigHashType, tt.args.fetcher)
			if (err != nil) != tt.wantErr {
				t.Errorf("SignInput() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if tt.wantErr {
				require.Equal(t, tt.err.Error(), err.Error())
			}
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("SignInput() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestVerifyInputs(t *testing.T) {
	// Extract the tx from the finished PSBT
	tx, err := psbt.Extract(finishedPkt)
	require.NoError(t, err, "failed to extract tx from PSBT")

	// Create the fetcher
	fetcher := txscript.NewCannedPrevOutputFetcher(finishedPkt.Inputs[0].WitnessUtxo.PkScript, finishedPkt.Inputs[0].WitnessUtxo.Value)

	wrongFetcher := txscript.NewCannedPrevOutputFetcher([]byte{0x00}, 0)
	wrongPkt, err := psbt.NewFromRawBytes(bytes.NewReader([]byte(finishedPsbt)), true)
	require.NoError(t, err, "failed to create PSBT from raw bytes")
	wrongPkt.Inputs[0].WitnessUtxo = wire.NewTxOut(0, []byte{})

	type args struct {
		pkt            *psbt.Packet
		tx             *wire.MsgTx
		hashCache      *txscript.TxSigHashes
		prevoutFetcher txscript.PrevOutputFetcher
	}
	tests := []struct {
		name    string
		args    args
		wantErr bool
		err     error
	}{
		{
			name: "valid input",
			args: args{
				pkt:            finishedPkt,
				tx:             tx,
				hashCache:      txscript.NewTxSigHashes(tx, fetcher),
				prevoutFetcher: fetcher,
			},
			wantErr: false,
		},
		{
			name: "invalid engine",
			args: args{
				pkt:            wrongPkt,
				tx:             tx,
				hashCache:      txscript.NewTxSigHashes(tx, wrongFetcher),
				prevoutFetcher: wrongFetcher,
			},
			wantErr: true,
			err:     errors.New("failed to create script engine: false stack entry at end of script execution"),
		},
		{
			name: "invalid input",
			args: args{
				pkt:            pkt,
				tx:             tx,
				hashCache:      txscript.NewTxSigHashes(tx, fetcher),
				prevoutFetcher: fetcher,
			},
			wantErr: true,
			err:     errors.New("input 0: error executing script: should have exactly two items in witness, instead have 3"),
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := verifyInputs(tt.args.pkt, tt.args.tx, tt.args.hashCache, tt.args.prevoutFetcher)
			if (err != nil) != tt.wantErr {
				t.Errorf("VerifyInputs() error = %v, wantErr %v", err, tt.wantErr)
			}
			if tt.wantErr {
				require.Equal(t, tt.err.Error(), err.Error())
			}
		})
	}
}

func Test_addWitness(t *testing.T) {
	preimage, err := lntypes.MakePreimage(make([]byte, 32))
	require.NoError(t, err, "failed to create preimage")

	type args struct {
		input    *psbt.PInput
		sig      []byte
		preimage *lntypes.Preimage
	}
	tests := []struct {
		name               string
		args               args
		finalScriptWitness string
		wantErr            bool
	}{
		{
			name: "valid witness",
			args: args{
				input:    &pkt.Inputs[0],
				sig:      []byte{48, 69, 2, 33, 0, 217, 180, 175, 165, 244, 236, 88, 226, 35, 141, 254, 179, 162, 244, 169, 202, 217, 128, 190, 111, 38, 210, 38, 202, 238, 196, 230, 158, 132},
				preimage: &preimage,
			},
			finalScriptWitness: "03223045022100d9b4afa5f4ec58e2238dfeb3a2f4a9cad980be6f26d226caeec4e69e8420000000000000000000000000000000000000000000000000000000000000000000",
			wantErr:            false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := addWitness(tt.args.input, tt.args.sig, tt.args.preimage); (err != nil) != tt.wantErr {
				t.Errorf("addWitness() error = %v, wantErr %v", err, tt.wantErr)
			}

			finalScriptWitness := hex.EncodeToString(tt.args.input.FinalScriptWitness)
			if finalScriptWitness != tt.finalScriptWitness {
				t.Errorf("addWitness() wrong FinalScriptWitnessResult = %v, want %v", finalScriptWitness, tt.finalScriptWitness)
			}
		})
	}
}

func Test_finalizePSBT(t *testing.T) {
	unfinishedPkt, err := psbt.NewFromRawBytes(bytes.NewReader([]byte(unfinishedPsbt)), true)
	require.NoError(t, err, "failed to create PSBT from raw bytes")

	unsignedInputPkt, err := psbt.NewFromRawBytes(bytes.NewReader([]byte(finishedPsbt)), true)
	require.NoError(t, err, "failed to create PSBT from raw bytes")
	unsignedInputPkt.Inputs = append(unsignedInputPkt.Inputs, psbt.PInput{
		WitnessUtxo: &wire.TxOut{
			Value:    1000,
			PkScript: []byte{0x00, 0x14, 0x76, 0xa9, 0x14, 0x88, 0xac, 0x87, 0x6f, 0x6c, 0x8b, 0x1d, 0x88, 0xac},
		},
	})
	unsignedInputPkt.UnsignedTx.TxIn = append(unsignedInputPkt.UnsignedTx.TxIn, &wire.TxIn{
		PreviousOutPoint: wire.OutPoint{
			Hash:  chainhash.HashH([]byte{0x00}),
			Index: 0,
		},
		Sequence: 0,
	})

	type args struct {
		pkt *psbt.Packet
	}
	tests := []struct {
		name    string
		args    args
		wantErr bool
		err     error
	}{
		{
			name: "valid PSBT",
			args: args{
				pkt: finishedPkt,
			},
			wantErr: false,
		},
		{
			name: "not signed PSBT",
			args: args{
				pkt: unfinishedPkt,
			},
			wantErr: true,
			err:     errors.New("failed to finalize PSBT: PSBT is not finalizable"),
		},
		{
			name: "signed PSBT with unsigned output",
			args: args{
				pkt: unsignedInputPkt,
			},
			wantErr: true,
			err:     errors.New("PSBT is not complete"),
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := finalizePSBT(tt.args.pkt)
			if (err != nil) != tt.wantErr {
				t.Errorf("FinalizePSBT() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if tt.wantErr {
				require.Equal(t, tt.err.Error(), err.Error())
			}
		})
	}
}

func TestSignFinishExtractPSBT(t *testing.T) {
	wrongPkt, err := psbt.NewFromRawBytes(bytes.NewReader([]byte(unfinishedPsbt)), true)
	require.NoError(t, err, "failed to create PSBT from raw bytes")
	wrongPkt.UnsignedTx.TxIn = append(wrongPkt.UnsignedTx.TxIn, &wire.TxIn{
		PreviousOutPoint: wire.OutPoint{
			Hash:  chainhash.HashH([]byte{0x00}),
			Index: 0,
		},
		Sequence:        0,
		SignatureScript: []byte{0x00},
		Witness:         [][]byte{{0x00}},
	})
	wrongPkt.Inputs = append(wrongPkt.Inputs, psbt.PInput{
		WitnessUtxo: &wire.TxOut{
			Value:    1000,
			PkScript: []byte{0x00},
		},
	})

	type args struct {
		logger     *log.Entry
		pkt        *psbt.Packet
		privateKey *btcec.PrivateKey
		preimage   *lntypes.Preimage
		input      int
	}
	tests := []struct {
		name    string
		args    args
		want    *psbt.Packet
		wantErr bool
		err     error
	}{
		{
			name: "valid PSBT",
			args: args{
				logger:     log.WithField("test", "SignFinishExtractPSBT"),
				pkt:        unfinishedPkt,
				privateKey: privKey,
				preimage:   &preimage,
				input:      0,
			},
			want:    finishedPkt,
			wantErr: false,
		},
		{
			name: "invalid input index",
			args: args{
				logger:     log.WithField("test", "SignFinishExtractPSBT"),
				pkt:        unfinishedPkt,
				privateKey: privKey,
				preimage:   &preimage,
				input:      -1,
			},
			want:    nil,
			wantErr: true,
			err:     errors.New("invalid input index: -1"),
		},
		{
			name: "not finalized PSBT",
			args: args{
				logger:     log.WithField("test", "SignFinishExtractPSBT"),
				pkt:        wrongPkt,
				privateKey: privKey,
				preimage:   &preimage,
				input:      0,
			},
			want:    nil,
			wantErr: true,
			err:     errors.New("failed to finalize PSBT: PSBT is not complete"),
		},
		{
			name: "invalid preimage",
			args: args{
				logger:     log.WithField("test", "SignFinishExtractPSBT"),
				pkt:        unfinishedPkt,
				privateKey: privKey,
				preimage:   &lntypes.Preimage{},
				input:      0,
			},
			want:    nil,
			wantErr: true,
			err:     errors.New("failed to verify inputs: input 0: error executing script: OP_EQUALVERIFY failed"),
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := SignFinishExtractPSBT(tt.args.logger, tt.args.pkt, tt.args.privateKey, tt.args.preimage, tt.args.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("ProcessPSBT() error = %v, wantErr %v", err, tt.wantErr)

				return
			}
			if tt.wantErr {
				require.Equal(t, tt.err.Error(), err.Error())

				return
			}

			// Extract the tx from the finished PSBT
			tx, err := psbt.Extract(tt.want)
			require.NoError(t, err, "failed to extract tx from PSBT")

			//Serialize both transactions
			wantBuffer := bytes.NewBuffer(nil)
			err = tx.Serialize(wantBuffer)
			require.NoError(t, err, "failed to serialize transaction")
			gotBuffer := bytes.NewBuffer(nil)
			err = got.Serialize(gotBuffer)
			require.NoError(t, err, "failed to serialize transaction")

			if !reflect.DeepEqual(gotBuffer, wantBuffer) {
				t.Errorf("ProcessPSBT() = %v, want %v", got, tt.want)
			}
		})
	}
}
