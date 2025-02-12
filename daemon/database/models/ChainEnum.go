package models

import (
	"database/sql/driver"
	"fmt"
)

type Chain string

const (
	Bitcoin Chain = "bitcoin"
	Liquid  Chain = "liquid"
)

func (c Chain) IsValid() bool {
	return c == Bitcoin || c == Liquid
}

func (c Chain) String() string {
	return string(c)
}

func (c *Chain) Scan(value interface{}) error {
	str, ok := value.(string)
	if !ok {
		return fmt.Errorf("failed to scan Chain: expected string, got %T", value)
	}
	*c = Chain(str)

	return nil
}

func (c Chain) Value() (driver.Value, error) {
	return string(c), nil
}

func ChainEnumSQL() string {
	return `CREATE TYPE chain_enum AS ENUM ('bitcoin', 'liquid');`
}
