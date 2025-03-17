package money

import (
	"testing"

	"github.com/shopspring/decimal"
)

func TestNewFromBtc(t *testing.T) {
	type args struct {
		amount decimal.Decimal
	}
	tests := []struct {
		name    string
		args    args
		want    Money
		wantErr bool
	}{
		{
			name: "NewFromBtc - Pass",
			args: args{
				amount: decimal.NewFromInt(1),
			},
			want:    100000000,
			wantErr: false,
		},
		{
			name: "NewFromBtc - Fail Negative Amount",
			args: args{
				amount: decimal.NewFromInt(-1),
			},
			want:    0,
			wantErr: true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := NewFromBtc(tt.args.amount)
			if (err != nil) != tt.wantErr {
				t.Errorf("NewFromBtc() error = %v, wantErr %v", err, tt.wantErr)

				return
			}
			if got != tt.want {
				t.Errorf("NewFromBtc() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestMoney_ToBtc(t *testing.T) {
	tests := []struct {
		name string
		m    Money
		want decimal.Decimal
	}{
		{
			name: "To BTC - Pass",
			m:    100000000,
			want: decimal.NewFromInt(1),
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.m.ToBtc(); got.Cmp(tt.want) != 0 {
				t.Errorf("Money.ToBtc() = %v, want %v", got, tt.want)
			}
		})
	}
}
