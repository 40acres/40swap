package crypto

import (
	"encoding/hex"

	"github.com/btcsuite/btcd/btcec/v2"
)

func GenerateECKeyPair() (string, string, error) {
	// Generate an EC key pair with bitcoin library
	privKey, err := btcec.NewPrivateKey()
	if err != nil {
		return "", "", err
	}
	// Generate the public key from the private key
	pubKey := privKey.PubKey()

	// convert keys to hex
	privKeyHex := hex.EncodeToString(privKey.Serialize())
	pubKeyHex := hex.EncodeToString(pubKey.SerializeCompressed())

	return privKeyHex, pubKeyHex, nil
}
