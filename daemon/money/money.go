package money

import (
	"github.com/shopspring/decimal"
)

type Money int64

func NewFromBtc(amount decimal.Decimal) Money {
	return Money(amount.Mul(decimal.NewFromInt(1e8)).IntPart())
}

func (m Money) ToBtc() decimal.Decimal {
	return decimal.NewFromInt(int64(m)).Div(decimal.NewFromInt(1e8))
}
