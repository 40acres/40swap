package lightning

import (
	"context"
	"fmt"
	"time"

	"github.com/shopspring/decimal"
)

const DefaultCltvExpiry uint64 = 144

var ErrInvoiceCanceled = fmt.Errorf("invoice canceled")

type Preimage = string
type NetworkFeeSats = int64

type GraphStatus struct {
	GraphSynced bool
	ChainSynced bool
}

//go:generate go tool mockgen -destination=mock.go -package=lightning . Client
type Client interface {
	PayInvoice(ctx context.Context, paymentRequest string, feeLimitRatio float64) error
	MonitorPaymentRequest(ctx context.Context, paymentHash string) (Preimage, NetworkFeeSats, error)
	MonitorPaymentReception(ctx context.Context, rhash []byte) (Preimage, error)
	GenerateInvoice(ctx context.Context, amountSats decimal.Decimal, expiry time.Duration, memo string) (paymentRequest string, rhash []byte, e error)
	GenerateAddress(ctx context.Context) (string, error)
	GetInvoicePreimage(ctx context.Context, rhash [32]byte) (Preimage, error)
}
