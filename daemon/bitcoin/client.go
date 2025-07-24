package bitcoin

import (
	"context"

	"github.com/btcsuite/btcd/wire"
)

type Speed string

const (
	FastestFee  Speed = "fastestFee"
	HalfHourFee Speed = "halfHourFee"
	HourFee     Speed = "hourFee"
	EconomyFee  Speed = "economyFee"
	MinimumFee  Speed = "minimumFee"
)

//go:generate go tool mockgen -destination=mock.go -package=bitcoin . Client
type Client interface {
	PostRefund(ctx context.Context, tx string) error
	GetTxFromOutpoint(ctx context.Context, outpoint string) (*wire.MsgTx, error)
	GetTxFromTxID(ctx context.Context, txID string) (*wire.MsgTx, error)
	GetRecommendedFees(ctx context.Context, speed Speed) (int64, error)
	GetFeeFromTxId(ctx context.Context, txId string) (int64, error)
}
