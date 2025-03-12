package models

import (
	"time"
)

type SwapIn struct {
	ID uint `gorm:"primaryKey;autoIncrement"`

	// The swap identifier for the swap service
	SwapID      string     `gorm:"not null"`
	AmountSATS  uint64     `gorm:"not null"`
	Status      SwapStatus `gorm:"type:status_enum;not null"`
	SourceChain Chain      `gorm:"type:chain_enum;not null"`

	// The address where we will pay to
	DestinationAddress string
	DestinationTx      string
	// If we surpass the timeout block height we can ask for a refund
	TimeoutBlockHeight uint64
	// The address where the service will refund us to
	RefundAddress    string
	RefundTx         string
	RefundPrivatekey string `gorm:"not null"`

	// The redeem script for the on-chain transaction
	RedeemScript string

	// The lightning address where the money will be received
	PaymentRequest string `gorm:"not null"`
	PreImage       string

	OnChainFeeSATS uint64 `gorm:"not null"`
	ServiceFeeSATS uint64 `gorm:"not null"`

	CreatedAt time.Time `gorm:"autoCreateTime"`
	UpdatedAt time.Time `gorm:"autoUpdateTime"`
}

func (SwapIn) TableName() string {
	return "swap_ins"
}
