package lightning

import (
	"encoding/hex"
	"testing"
	"time"

	"github.com/btcsuite/btcd/btcec/v2"
	"github.com/btcsuite/btcd/btcec/v2/ecdsa"
	"github.com/btcsuite/btcd/btcutil"
	"github.com/btcsuite/btcd/chaincfg"
	"github.com/btcsuite/btcd/chaincfg/chainhash"
	"github.com/lightningnetwork/lnd/lnwire"
	"github.com/lightningnetwork/lnd/zpay32"
	"github.com/stretchr/testify/require"
)

var (
	TestPaymentHash = [32]byte{
		0xd7, 0x8a, 0x8b, 0xa8, 0xb6, 0x25, 0x10, 0x27,
		0xf3, 0x7f, 0xd6, 0xfe, 0xbf, 0xf0, 0x31, 0x5f,
		0x2d, 0x45, 0xbe, 0x83, 0x1b, 0xa3, 0x13, 0xfb,
		0x23, 0xc6, 0xe0, 0x3a, 0x2a, 0xbe, 0x3c, 0xa5,
	}
	TestPreimage = [32]byte{
		0x01, 0xda, 0x5d, 0x7d, 0x74, 0x0a, 0xc5, 0x7f,
		0xcd, 0xc1, 0x5f, 0xd4, 0x7b, 0x9c, 0x8c, 0x0c,
		0x3b, 0xa3, 0xb7, 0xb7, 0x62, 0xd1, 0x26, 0xdf,
		0x10, 0xfa, 0xb4, 0xad, 0x95, 0xd9, 0x84, 0x00,
	}

	TestPrivKeyBytes, _ = hex.DecodeString("e126f68f7eafcc8b74f54d269fe206be715000f94dac067d1c04a8ca3b2db734")

	TestPrivKey, _ = btcec.PrivKeyFromBytes(TestPrivKeyBytes)

	TestMessageSigner = zpay32.MessageSigner{
		SignCompact: func(msg []byte) ([]byte, error) {
			hash := chainhash.HashB(msg)
			sig := ecdsa.SignCompact(TestPrivKey, hash, true)

			return sig, nil
		},
	}

	Description   = "test description"
	EmptyFeatures = lnwire.NewFeatureVector(nil, lnwire.Features)
)

type InvoiceOption func(*zpay32.Invoice)

func CreateMockInvoice(t *testing.T, amsats int64, opts ...InvoiceOption) string {
	t.Helper()

	var decodedInvoice = zpay32.Invoice{
		Net:         &chaincfg.RegressionNetParams,
		PaymentHash: &TestPaymentHash,
		Description: &Description,
		Features:    EmptyFeatures,
		Timestamp:   time.Now(),
	}

	if amsats >= 0 {
		amountInMillisats := lnwire.NewMSatFromSatoshis(btcutil.Amount(amsats))
		decodedInvoice.MilliSat = &amountInMillisats
	}

	for _, opt := range opts {
		opt(&decodedInvoice)
	}

	s, err := decodedInvoice.Encode(TestMessageSigner)
	require.NoErrorf(t, err, "encoding mock invoice: %v", err)

	return s
}
