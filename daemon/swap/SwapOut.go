package swap

import (
	"database/sql/driver"

	"gorm.io/gorm"
)

type SwapStatus string

const (
	SwapStatusPending    SwapStatus = "pending"
	SwapStatusInProgress SwapStatus = "in_progress"
	SwapStatusCompleted  SwapStatus = "completed"
	SwapStatusFailed     SwapStatus = "failed"
)

func (s *SwapStatus) Scan(value interface{}) error {
	*s = SwapStatus(value.(string))
	return nil
}

func (s SwapStatus) Value() (driver.Value, error) {
	return string(s), nil
}

type DestinationChain string

const (
	DestinationChainBitcoin  DestinationChain = "bitcoin"
	DestinationChainLitecoin DestinationChain = "litecoin"
	DestinationChainDogecoin DestinationChain = "dogecoin"
)

func (d *DestinationChain) Scan(value interface{}) error {
	*d = DestinationChain(value.(string))
	return nil
}

func (d DestinationChain) Value() (driver.Value, error) {
	return string(d), nil
}

type SwapOut struct {
	gorm.Model
	Status             SwapStatus       `gorm:"type:swap_status;not null;default:'pending'"`
	AmountSats         uint64           `gorm:"not null;default:0"`
	DestinationAddress string           `gorm:"not null;default:''"`
	ServiceFeeSats     uint64           `gorm:"not null;default:0"`
	OnchainFeeSats     uint64           `gorm:"not null;default:0"`
	OffchainFeeSats    uint64           `gorm:"not null;default:0"`
	DestinationChain   DestinationChain `gorm:"type:destination_chain;not null;default:'bitcoin'"`
	ClaimPubkey        string           `gorm:"not null;default:''"`
	PaymentRequest     string           `gorm:"not null;default:''"`
	Description        *string          `gorm:"default:null"`
	MaxRoutingFeeRatio float64          `gorm:"not null;default:0"`
}

func (SwapOut) TableName() string {
	return "swap_outs"
}
