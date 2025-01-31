package swap

import (
	"time"
)

type SwapOut struct {
	ID                 uint      `gorm:"primaryKey;autoIncrement"`
	Datetime           time.Time `gorm:"not null" json:"datetime"`
	Status             string    `gorm:"type:status_enum;not null" json:"status"`
	AmountSATS         int64     `gorm:"not null" json:"amount_sats"`
	DestinationAddress string    `gorm:"size:255;not null" json:"destination_address"`
	ServiceFee         float64   `gorm:"not null" json:"service_fee"`
	OnchainFee         float64   `gorm:"not null" json:"onchain_fee"`
	OffchainFee        float64   `gorm:"not null" json:"offchain_fee"`
	DestinationChain   string    `gorm:"size:255;not null" json:"destination_chain"`
	ClaimPubkey        string    `gorm:"size:255;not null" json:"claim_pubkey"`
	Invoice            string    `gorm:"size:255;not null" json:"invoice"`
	Description        string    `gorm:"size:255;not null" json:"description"`
	MaxRoutingFeeRatio float64   `gorm:"not null" json:"max_routing_fee_ratio"`
}

func (SwapOut) TableName() string {
	return "swap_outs"
}
