package swap

import (
	"database/sql/driver"
	"fmt"
)

type Chain string

const (
	ChainBitcoin Chain = "bitcoin"
	ChainLiquid  Chain = "liquid"
)

// IsValid checks if the Chain value is valid
func (c Chain) IsValid() bool {
	return c == ChainBitcoin || c == ChainLiquid
}

// String returns the string representation
func (c Chain) String() string {
	return string(c)
}

// Scan implements the sql.Scanner interface for Chain
func (c *Chain) Scan(value interface{}) error {
	str, ok := value.(string)
	if !ok {
		return fmt.Errorf("failed to scan Chain: expected string, got %T", value)
	}
	*c = Chain(str)

	return nil
}

// Value implements the driver.Valuer interface for Chain
func (c Chain) Value() (driver.Value, error) {
	return string(c), nil
}
