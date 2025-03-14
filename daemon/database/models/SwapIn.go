package models

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"time"

	"github.com/lightningnetwork/lnd/lntypes"
	"gorm.io/gorm/schema"
)

type SwapIn struct {
	ID uint `gorm:"primaryKey;autoIncrement"`

	// The swap identifier for the swap service
	SwapID      string     `gorm:"not null"`
	AmountSATS  uint64     `gorm:"not null"`
	Status      SwapStatus `gorm:"type:status_enum;not null"`
	SourceChain Chain      `gorm:"type:chain_enum;not null"`

	// The address where we will pay to and it's tx id
	ClaimAddress string
	ClaimTxId    string
	// If we surpass the timeout block height we can ask for a refund
	TimeoutBlockHeight uint64
	// The address where the service will refund us to and it's tx id
	RefundAddress    string
	RefundTxId       string
	RefundPrivatekey string `gorm:"not null"`

	// The redeem script for the on-chain transaction
	RedeemScript string

	// The lightning address where the money will be received
	PaymentRequest string           `gorm:"not null"`
	PreImage       lntypes.Preimage `gorm:"serializer:preimage"`

	OnChainFeeSATS uint64 `gorm:"not null"`
	ServiceFeeSATS uint64 `gorm:"not null"`

	CreatedAt time.Time `gorm:"autoCreateTime"`
	UpdatedAt time.Time `gorm:"autoUpdateTime"`
}

func (SwapIn) TableName() string {
	return "swap_ins"
}

// PreimageSerializer handles serialization/deserialization of lntypes.Preimage
type PreimageSerializer struct {
}

// Scan implements serializer interface
func (PreimageSerializer) Scan(ctx context.Context, field *schema.Field, dst reflect.Value, dbValue interface{}) (err error) {
	if dbValue == nil {
		return nil
	}

	preimageStr, ok := dbValue.(string)
	if !ok {
		if bytesVal, ok := dbValue.([]byte); ok {
			preimageStr = string(bytesVal)
		} else {
			return errors.New(fmt.Sprint("Failed to cast preimage value:", dbValue))
		}
	}

	bytes, err := lntypes.MakePreimageFromStr(preimageStr)
	if err != nil {
		return err
	}

	fieldValue := reflect.New(field.FieldType).Elem()
	fieldValue.Set(reflect.ValueOf(bytes))
	field.ReflectValueOf(ctx, dst).Set(fieldValue)

	return nil
}

// Value implements serializer interface
func (PreimageSerializer) Value(ctx context.Context, field *schema.Field, dst reflect.Value, fieldValue interface{}) (interface{}, error) {
	if p, ok := fieldValue.(lntypes.Preimage); ok {
		if len(p) == 0 {
			return nil, nil
		}

		return p.String(), nil
	}

	return nil, errors.New("invalid preimage value")
}

func RegisterPreimageSerializer() {
	// Register a custom serializer
	schema.RegisterSerializer("preimage", PreimageSerializer{})
}
