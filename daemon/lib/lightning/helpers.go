package lightning

import (
	"encoding/hex"

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
