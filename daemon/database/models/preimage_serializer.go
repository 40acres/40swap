package models

import (
	"context"
	"errors"
	"fmt"
	"reflect"

	"github.com/lightningnetwork/lnd/lntypes"
	"gorm.io/gorm/schema"
)

// PreimageSerializer handles serialization/deserialization of *lntypes.Preimage
type PreimageSerializer struct{}

// Scan implements serializer interface
func (PreimageSerializer) Scan(ctx context.Context, field *schema.Field, dst reflect.Value, dbValue interface{}) error {
	if dbValue == nil {
		return nil
	}

	var preimageStr string
	switch v := dbValue.(type) {
	case string:
		preimageStr = v
	case []byte:
		preimageStr = string(v)
	default:
		return fmt.Errorf("failed to cast preimage value: %v", dbValue)
	}

	preimagePointer := dst.Elem().FieldByName(field.Name)
	if preimageStr == "" {
		preimagePointer.Set(reflect.Zero(field.FieldType)) // Ensure nil pointer

		return nil
	}

	preimage, err := lntypes.MakePreimageFromStr(preimageStr)
	if err != nil {
		return fmt.Errorf("failed to parse preimage: %w", err)
	}

	preimagePointer.Set(reflect.ValueOf(&preimage)) // Set *lntypes.Preimage

	return nil
}

// Value implements serializer interface
func (PreimageSerializer) Value(ctx context.Context, field *schema.Field, dst reflect.Value, fieldValue interface{}) (interface{}, error) {
	if fieldValue == nil {
		return nil, nil
	}

	preimage, ok := fieldValue.(*lntypes.Preimage)
	if !ok {
		return nil, errors.New("invalid preimage value: not a *lntypes.Preimage")
	}

	if preimage == nil {
		return nil, nil // Return nil for nil preimage
	}

	return preimage.String(), nil
}

func RegisterPreimageSerializer() {
	schema.RegisterSerializer("preimage", PreimageSerializer{})
}
