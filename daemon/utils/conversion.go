package utils

import (
	"fmt"
	"math"
)

// SafeUint32ToInt32 safely converts uint32 to int32, returning an error if overflow would occur
func SafeUint32ToInt32(value uint32) (int32, error) {
	if value > math.MaxInt32 {
		return 0, fmt.Errorf("uint32 value %d exceeds int32 maximum %d", value, math.MaxInt32)
	}

	return int32(value), nil //nolint:gosec // Conversion is safe after overflow check
}

// safeInt64ToUint32 safely converts int64 to uint32, returning an error if overflow would occur
func SafeInt64ToUint32(value int64) (uint32, error) {
	if value < 0 {
		return 0, fmt.Errorf("value %d is negative and cannot be converted to uint32", value)
	}
	if value > math.MaxUint32 {
		return 0, fmt.Errorf("value %d exceeds maximum uint32 value (%d)", value, math.MaxUint32)
	}

	return uint32(value), nil
}
