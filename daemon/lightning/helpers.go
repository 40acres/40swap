package lightning

import (
	"encoding/hex"

	"github.com/btcsuite/btcd/btcec/v2"
	"github.com/btcsuite/btcd/chaincfg"
)

// ParsePubKey parses a hex-encoded public key (bitcon secp256k1) string into a btcec public key object
func ParsePubKey(pubKeyStr string) (*btcec.PublicKey, error) {
	pubKeyBytes, err := hex.DecodeString(pubKeyStr)
	if err != nil {
		return nil, err
	}

	pubKey, err := btcec.ParsePubKey(pubKeyBytes)
	if err != nil {
		return nil, err
	}

	return pubKey, nil
}

type Network string

const Mainnet Network = "mainnet"
const Regtest Network = "regtest"
const Testnet Network = "testnet"

func ToChainCfgNetwork(network Network) *chaincfg.Params {
	switch network {
	case Mainnet:
		return &chaincfg.MainNetParams
	case Regtest:
		return &chaincfg.RegressionNetParams
	case Testnet:
		return &chaincfg.TestNet3Params
	default:
		return nil
	}
}
