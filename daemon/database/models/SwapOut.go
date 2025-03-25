package models

import (
	"gorm.io/gorm"
)

type SwapOut struct {
	gorm.Model
	SwapId             string      `gorm:"not null;unique"`
	Status             SwapStatus  `gorm:"type:swap_status;not null"`
	Outcome            SwapOutcome `gorm:"type:swap_outcome;not null"`
	AmountSATS         uint64      `gorm:"not null"`
	DestinationAddress string      `gorm:"not null"`
	ServiceFeeSATS     uint64      `gorm:"not null"`
	OnchainFeeSATS     uint64      `gorm:"not null"`
	OffchainFeeSATS    uint64      `gorm:"not null"`
	DestinationChain   Chain       `gorm:"type:chain_enum;not null"`
	ClaimPubkey        string      `gorm:"not null"`
	PaymentRequest     string      `gorm:"not null"`
	Description        *string     `gorm:"not null"`
	MaxRoutingFeeRatio float64     `gorm:"not null"`
}

func (SwapOut) TableName() string {
	return "swap_outs"
}
