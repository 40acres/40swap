package lightning

import (
	"encoding/hex"
	"errors"
	"fmt"
	"strings"

	"github.com/btcsuite/btcd/btcec/v2"
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

func CheckInvoicePrefix(bolt11 string, network Network) error {
	firstNumber := strings.IndexAny(bolt11, "1234567890")
	if firstNumber < 2 {
		return errors.New("invalid bolt11 invoice")
	}

	chainPrefix := strings.ToLower(bolt11[2:firstNumber])
	switch {
	case strings.EqualFold(chainPrefix, "bcrt") && network == Regtest:
		break
	case strings.EqualFold(chainPrefix, "tb") && network == Testnet:
		break
	case strings.EqualFold(chainPrefix, "bc") && network == Mainnet:
		break
	default:
		return fmt.Errorf("invoice is invalid for %s network", network)
	}

	return nil
}
