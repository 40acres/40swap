package swap

import (
	"time"
)

type SwapOut struct {
	ID                  uint      `gorm:"primaryKey;autoIncrement"`
	Datetime            time.Time `gorm:"autoCreateTime"`
	Status              string    `gorm:"type:status_enum;not null" json:"status"`
	AmountSATS          uint64    `gorm:"not null" json:"amountSats"`
	DestinationAddress  string    `gorm:"size:255;not null" json:"destinationAddress"`
	ServiceFeeSatoshis  uint64    `gorm:"not null" json:"serviceFeeSatoshis"`
	OnchainFeeSatoshis  uint64    `gorm:"not null" json:"onchainFeeSatoshis"`
	OffchainFeeSatoshis uint64    `gorm:"not null" json:"offchainFeeSatoshis"`
	DestinationChain    string    `gorm:"type:chain_enum;size:255;not null" json:"destinationChain"`
	ClaimPubkey         string    `gorm:"size:255;not null" json:"claimPubkey"`
	PaymentRequest      string    `gorm:"size:255;not null" json:"paymentRequest"`
	Description         *string   `gorm:"size:255" json:"description"`
	MaxRoutingFeeRatio  float64   `gorm:"not null" json:"maxRoutingFeeRatio"`
}

func (SwapOut) TableName() string {
	return "swap_outs"
}
