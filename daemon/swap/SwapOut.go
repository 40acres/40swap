package swap

import (
	"time"
)

type SwapOut struct {
	ID                 uint      `gorm:"primaryKey;autoIncrement"`
	Datetime           time.Time `gorm:"not null" json:"datetime"`
	Status             string    `gorm:"type:status_enum;not null" json:"status"`
	AmountSATS         int64     `gorm:"not null" json:"amountSats"`
	DestinationAddress string    `gorm:"size:255;not null" json:"destinationAddress"`
	ServiceFee         float64   `gorm:"not null" json:"serviceFee"`
	OnchainFee         float64   `gorm:"not null" json:"onchainFee"`
	OffchainFee        float64   `gorm:"not null" json:"offchainFee"`
	DestinationChain   string    `gorm:"size:255;not null" json:"destinationChain"`
	ClaimPubkey        string    `gorm:"size:255;not null" json:"claimPubkey"`
	Invoice            string    `gorm:"size:255;not null" json:"invoice"`
	Description        string    `gorm:"size:255;not null" json:"description"`
	MaxRoutingFeeRatio float64   `gorm:"not null" json:"maxRoutingFeeRatio"`
}

func (SwapOut) TableName() string {
	return "swap_outs"
}
