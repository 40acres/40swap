package crypto

import (
	"github.com/btcsuite/btcd/btcec/v2"
)

func GenerateECKey() (*btcec.PrivateKey, error) {
	// Generate an EC key pair with bitcoin library
	privKey, err := btcec.NewPrivateKey()
	if err != nil {
		return nil, err
	}

	return privKey, nil
}
