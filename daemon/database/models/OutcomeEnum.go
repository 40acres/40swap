package models

import (
	"database/sql/driver"
	"fmt"
)

type SwapOutcome string

const (
	OutcomeSuccess  SwapOutcome = "SUCCESS"
	OutcomeRefunded SwapOutcome = "REFUNDED"
	OutcomeExpired  SwapOutcome = "EXPIRED"
)

func (s SwapOutcome) String() string {
	return string(s)
}

func (s *SwapOutcome) Scan(value interface{}) error {
	str, ok := value.(string)
	if !ok {
		return fmt.Errorf("failed to scan SwapOutcome: expected string, got %T", value)
	}
	*s = SwapOutcome(str)

	return nil
}

func (s SwapOutcome) Value() (driver.Value, error) {
	return string(s), nil
}

func SwapOutcomeEnumSQL() string {
	return `CREATE TYPE "public"."swap_outcome" AS ENUM (
		'SUCCESS',
		'REFUNDED',
		'EXPIRED'
	);
	`
}
