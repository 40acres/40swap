package swap

import (
	"database/sql/driver"
	"fmt"
)

type SwapStatus string

const (
	StatusPending   SwapStatus = "pending"
	StatusCompleted SwapStatus = "completed"
	StatusFailed    SwapStatus = "failed"
)

// IsValid checks if the SwapStatus value is valid
func (s SwapStatus) IsValid() bool {
	return s == StatusPending || s == StatusCompleted || s == StatusFailed
}

// String returns the string representation
func (s SwapStatus) String() string {
	return string(s)
}

// Scan implements the sql.Scanner interface for SwapStatus
func (s *SwapStatus) Scan(value interface{}) error {
	str, ok := value.(string)
	if !ok {
		return fmt.Errorf("failed to scan SwapStatus: expected string, got %T", value)
	}
	*s = SwapStatus(str)
	return nil
}

// Value implements the driver.Valuer interface for SwapStatus
func (s SwapStatus) Value() (driver.Value, error) {
	return string(s), nil
}
