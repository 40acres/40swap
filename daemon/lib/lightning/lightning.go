package lightning

import (
	"context"
	"fmt"
	"time"

	"github.com/shopspring/decimal"
)

const DefaultCltvExpiry uint64 = 144

var ErrInvoiceCanceled = fmt.Errorf("invoice canceled")

// This will be the pubkey in the case of direct connection, or the dapr alias in the case of dapr
type PubKey = string
type Preimage = string
type NetworkFeeSats = int64

type GraphStatus struct {
	GraphSynced bool
	ChainSynced bool
}

//go:generate mockgen -destination=mock.go -package=lightning . Client
type Client interface {
	PubKey() PubKey
	GetGraphStatus(ctx context.Context) (*GraphStatus, error)
	PayInvoice(ctx context.Context, paymentRequest string) error
	MonitorPaymentRequest(ctx context.Context, paymentHash string) (Preimage, NetworkFeeSats, error)
	MonitorPaymentReception(ctx context.Context, rhash []byte) (Preimage, error)
	GenerateInvoice(ctx context.Context, amountSats decimal.Decimal, expiry time.Duration, memo string) (paymentRequest string, rhash []byte, e error)
}
