package lightning

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"

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

// ValidatePreimage validates that a preimage matches a payment hash
func ValidatePreimage(preimage string, paymentHash string) error {
	if preimage == "" {
		return errors.New("preimage is empty")
	}
	if paymentHash == "" {
		return errors.New("payment hash is empty")
	}

	decodedPreimage, err := hex.DecodeString(preimage)
	if err != nil {
		return errors.New("preimage is not a valid hex string")
	}
	preimageHash := sha256.Sum256(decodedPreimage)
	preimageHashString := hex.EncodeToString(preimageHash[:])
	if paymentHash != preimageHashString {
		return errors.New("preimage does not match bolt11 payment hash")
	}

	return nil
}
