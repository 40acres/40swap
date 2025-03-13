package swaps

import (
	"time"

	"github.com/40acres/40swap/daemon/database/models"
	"github.com/shopspring/decimal"
)

type SwapClient interface {
	CreateSwapOut(address string, amount string) error
	GetSwapOut(swapId string) error
}

type CreateSwapOutRequest struct {
	Chain        models.Chain
	PreImageHash string
	ClaimPubKey  string
	Amount       decimal.Decimal
}

type SwapOutResponse struct {
	SwapId             string            `json:"swapId"`
	TimeoutBlockHeight int               `json:"timeoutBlockHeight"`
	Invoice            string            `json:"invoice"`
	InputAmountSATS    uint64            `json:"inputAmountSATS"`
	OutputAmountSATS   uint64            `json:"outputAmountSATS"`
	Status             models.SwapStatus `json:"status"`
	CreatedAt          time.Time         `json:"createdAt"`
}
