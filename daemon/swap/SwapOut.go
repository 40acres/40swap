package swap

import (
	"time"
)

type SwapOut struct {
	ID                 uint       `gorm:"primaryKey;autoIncrement"`
	Status             SwapStatus `gorm:"type:status_enum;not null"`
	AmountSATS         uint64     `gorm:"not null"`
	DestinationAddress string     `gorm:"size:255;not null"`
	ServiceFeeSATS     uint64     `gorm:"not null"`
	OnchainFeeSATS     uint64     `gorm:"not null"`
	OffchainFeeSATS    uint64     `gorm:"not null"`
	DestinationChain   Chain      `gorm:"type:chain_enum;size:255;not null"`
	ClaimPubkey        string     `gorm:"size:255;not null"`
	PaymentRequest     string     `gorm:"size:255;not null"`
	Description        *string    `gorm:"size:255"`
	MaxRoutingFeeRatio float64    `gorm:"not null"`
	CreatedAt          time.Time  `gorm:"autoCreateTime"`
	UpdatedAt          time.Time  `gorm:"autoUpdateTime"`
}

func (SwapOut) TableName() string {
	return "swap_outs"
}
