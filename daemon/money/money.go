package money

import (
	"github.com/shopspring/decimal"
)

// Money is a type that represents a monetary amount in satoshis for Bitcoin.
type Money uint64

func NewFromBtc(amount decimal.Decimal) Money {
	return Money(amount.Mul(decimal.NewFromInt(1e8)).IntPart())
}

func (m Money) ToBtc() decimal.Decimal {
	return decimal.NewFromUint64(uint64(m)).Div(decimal.NewFromInt(1e8))
}
