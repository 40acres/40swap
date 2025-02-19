package models

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

func (s SwapStatus) IsValid() bool {
	return s == StatusPending || s == StatusCompleted || s == StatusFailed
}

func (s SwapStatus) String() string {
	return string(s)
}

func (s *SwapStatus) Scan(value interface{}) error {
	str, ok := value.(string)
	if !ok {
		return fmt.Errorf("failed to scan SwapStatus: expected string, got %T", value)
	}
	*s = SwapStatus(str)

	return nil
}

func (s SwapStatus) Value() (driver.Value, error) {
	return string(s), nil
}
