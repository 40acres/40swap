package money

import (
	"errors"

	"github.com/shopspring/decimal"
)

// Money is a type that represents a monetary amount in satoshis for Bitcoin.
type Money uint64

// ErrNegativeAmount is returned when trying to create a Money with a negative amount.
var ErrNegativeAmount = errors.New("amount cannot be negative")

func NewFromBtc(amount decimal.Decimal) (Money, error) {
	if amount.IsNegative() {
		return 0, ErrNegativeAmount
	}

	return Money(amount.Mul(decimal.NewFromInt(1e8)).IntPart()), nil // nolint:gosec
}

func (m Money) ToBtc() decimal.Decimal {
	return decimal.NewFromUint64(uint64(m)).Div(decimal.NewFromInt(1e8))
}
