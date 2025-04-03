// Code generated by gorm.io/gen. DO NOT EDIT.
// Code generated by gorm.io/gen. DO NOT EDIT.
// Code generated by gorm.io/gen. DO NOT EDIT.

package models

import (
	"time"

	"github.com/lightningnetwork/lnd/lntypes"
)

const TableNameSwapIn = "swap_ins"

// SwapIn mapped from table <swap_ins>
type SwapIn struct {
	ID                 int64             `gorm:"column:id;type:bigint;primaryKey;autoIncrement:true;<-:create" json:"id"`
	SwapID             string            `gorm:"column:swap_id;type:text;not null" json:"swap_id"`
	AmountSats         int64             `gorm:"column:amount_sats;type:bigint;not null" json:"amount_sats"`
	Status             SwapStatus        `gorm:"column:status;type:swap_status;not null" json:"status"`
	Outcome            *SwapOutcome      `gorm:"column:outcome;type:swap_outcome" json:"outcome"`
	SourceChain        Chain             `gorm:"column:source_chain;type:chain_enum;not null" json:"source_chain"`
	ClaimAddress       string            `gorm:"column:claim_address;type:text" json:"claim_address"`
	ClaimTxID          string            `gorm:"column:claim_tx_id;type:text" json:"claim_tx_id"`
	TimeoutBlockHeight int64             `gorm:"column:timeout_block_height;type:bigint" json:"timeout_block_height"`
	RefundAddress      string            `gorm:"column:refund_address;type:text" json:"refund_address"`
	RefundTxID         string            `gorm:"column:refund_tx_id;type:text" json:"refund_tx_id"`
	RefundPrivatekey   string            `gorm:"column:refund_privatekey;type:text;not null" json:"refund_privatekey"`
	RedeemScript       string            `gorm:"column:redeem_script;type:text" json:"redeem_script"`
	PaymentRequest     string            `gorm:"column:payment_request;type:text;not null" json:"payment_request"`
	PreImage           *lntypes.Preimage `gorm:"column:pre_image;type:text" json:"pre_image" serializer:"preimage"`
	OnChainFeeSats     int64             `gorm:"column:on_chain_fee_sats;type:bigint;not null" json:"on_chain_fee_sats"`
	ServiceFeeSats     int64             `gorm:"column:service_fee_sats;type:bigint;not null" json:"service_fee_sats"`
	CreatedAt          time.Time         `gorm:"column:created_at;type:timestamp with time zone;<-:create" json:"created_at"`
	UpdatedAt          time.Time         `gorm:"column:updated_at;type:timestamp with time zone;<-:update" json:"updated_at"`
	RefundRequestedAt  time.Time         `gorm:"column:refund_requested_at;type:timestamp with time zone" json:"refund_requested_at"`
}

// TableName SwapIn's table name
func (*SwapIn) TableName() string {
	return TableNameSwapIn
}
