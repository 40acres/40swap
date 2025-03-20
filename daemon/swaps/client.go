package swaps

import (
	"context"
	"time"

	"github.com/40acres/40swap/daemon/database/models"
	"github.com/40acres/40swap/daemon/money"
	"github.com/shopspring/decimal"
)

type ClientInterface interface {
	CreateSwapOut(ctx context.Context, swapReq CreateSwapOutRequest) (*SwapOutResponse, error)
	GetSwapOut(ctx context.Context, swapId string) (*SwapOutResponse, error)
	CreateSwapIn(ctx context.Context, req *CreateSwapInRequest) (*SwapInResponse, error)
	GetSwapIn(ctx context.Context, swapId string) (*SwapInResponse, error)
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

type CreateSwapInRequest struct {
	Chain           models.Chain
	Invoice         string
	RefundPublicKey string
}

type SwapInResponse struct {
	// ContractAddress is the claim address for the swap
	ContractAddress    string  `json:"contractAddress"`
	CreatedAt          string  `json:"createdAt"`
	InputAmount        float32 `json:"inputAmount"`
	LockTx             *string `json:"lockTx"`
	Outcome            string  `json:"outcome"`
	OutputAmount       float32 `json:"outputAmount"`
	RedeemScript       string  `json:"redeemScript"`
	Status             string  `json:"status"`
	SwapId             string  `json:"swapId"`
	TimeoutBlockHeight float32 `json:"timeoutBlockHeight"`
}
