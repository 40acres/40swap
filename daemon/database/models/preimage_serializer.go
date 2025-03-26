package models

import (
	"context"
	"errors"
	"fmt"
	"reflect"

	"github.com/lightningnetwork/lnd/lntypes"
	"gorm.io/gorm/schema"
)

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
