package swaps

import (
	"context"
	"fmt"
	"time"

	"github.com/40acres/40swap/daemon/database/models"
	"github.com/40acres/40swap/daemon/lightning"
	"github.com/40acres/40swap/daemon/money"
	"github.com/shopspring/decimal"
)

var ErrSwapNotFound = fmt.Errorf("swap not found")

//go:generate go tool mockgen -destination=mock.go -package=swaps . ClientInterface
type ClientInterface interface {
	GetConfiguration(ctx context.Context) (*ConfigurationResponse, error)
	CreateSwapOut(ctx context.Context, swapReq CreateSwapOutRequest) (*SwapOutResponse, error)
	GetSwapOut(ctx context.Context, swapId string) (*SwapOutResponse, error)
	GetClaimPSBT(ctx context.Context, swapId, address string) (*GetClaimPSBTResponse, error)
	PostClaim(ctx context.Context, swapId, tx string) error
	CreateSwapIn(ctx context.Context, req *CreateSwapInRequest) (*SwapInResponse, error)
	GetSwapIn(ctx context.Context, swapId string) (*SwapInResponse, error)
	GetRefundPSBT(ctx context.Context, swapId, address string) (*RefundPSBTResponse, error)
	PostRefund(ctx context.Context, swapId, tx string) error
}

type ConfigurationResponse struct {
	BitcoinNetwork lightning.Network `json:"bitcoinNetwork"`
	FeePercentage  decimal.Decimal   `json:"feePercentage"`
	MinimumAmount  decimal.Decimal   `json:"minimumAmount"`
	MaximumAmount  decimal.Decimal   `json:"maximumAmount"`
}

type CreateSwapOutRequest struct {
	Chain        models.Chain
	PreImageHash string
	ClaimPubKey  string
	Amount       money.Money
}

type SwapOutResponse struct {
	SwapId             string             `json:"swapId"`
	TimeoutBlockHeight uint32             `json:"timeoutBlockHeight"`
	Invoice            string             `json:"invoice"`
	InputAmount        decimal.Decimal    `json:"inputAmount"`
	OutputAmount       decimal.Decimal    `json:"outputAmount"`
	Status             models.SwapStatus  `json:"status"`
	Outcome            models.SwapOutcome `json:"outcome"`
	CreatedAt          time.Time          `json:"createdAt"`
	TxId               *string            `json:"lockTx"`
}

type GetClaimPSBTResponse struct {
	PSBT string `json:"psbt"`
}

type CreateSwapInRequest struct {
	Chain           models.Chain
	Invoice         string
	RefundPublicKey string
}

type SwapInResponse struct {
	// ContractAddress is the claim address for the swap
	ContractAddress    string            `json:"contractAddress"`
	CreatedAt          time.Time         `json:"createdAt"`
	InputAmount        decimal.Decimal   `json:"inputAmount"`
	LockTx             *string           `json:"lockTx"`
	Outcome            string            `json:"outcome"`
	OutputAmount       decimal.Decimal   `json:"outputAmount"`
	RedeemScript       string            `json:"redeemScript"`
	Status             models.SwapStatus `json:"status"`
	SwapId             string            `json:"swapId"`
	TimeoutBlockHeight uint32            `json:"timeoutBlockHeight"`
}

type RefundPSBTResponse struct {
	PSBT string `json:"psbt"`
}
