package swaps

import (
	"time"

	"github.com/40acres/40swap/daemon/database/models"
	"github.com/40acres/40swap/daemon/money"
	"github.com/shopspring/decimal"
)

type ClientInterface interface {
	CreateSwapOut(address string, amount string) error
	GetSwapOut(swapId string) error
}

type CreateSwapOutRequest struct {
	Chain        models.Chain
	PreImageHash string
	ClaimPubKey  string
	Amount       money.Money
}

type SwapOutResponse struct {
	SwapId             string            `json:"swapId"`
	TimeoutBlockHeight int               `json:"timeoutBlockHeight"`
	Invoice            string            `json:"invoice"`
	InputAmount        decimal.Decimal   `json:"inputAmount"`
	OutputAmount       decimal.Decimal   `json:"outputAmount"`
	Status             models.SwapStatus `json:"status"`
	CreatedAt          time.Time         `json:"createdAt"`
}
