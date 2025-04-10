package models

import (
	"database/sql/driver"
	"fmt"
)

type SwapOutcome string

const (
	OutcomeFailed   SwapOutcome = "FAILED"
	OutcomeSuccess  SwapOutcome = "SUCCESS"
	OutcomeRefunded SwapOutcome = "REFUNDED"
	OutcomeExpired  SwapOutcome = "EXPIRED"
)

func (o SwapOutcome) String() string {
	return string(o)
}

func (o *SwapOutcome) Scan(value interface{}) error {
	if value == nil {
		*o = ""

		return nil
	}

	str, ok := value.(string)
	if !ok {
		return fmt.Errorf("failed to scan SwapOutcome: expected string, got %T", value)
	}
	*o = SwapOutcome(str)

	return nil
}

func (o SwapOutcome) Value() (driver.Value, error) {
	if o == "" {
		return nil, nil
	}

	return string(o), nil
}

func CreateSwapOutcomeEnumSQL() string {
	return `CREATE TYPE "public"."swap_outcome" AS ENUM (
		'FAILED',
		'SUCCESS',
		'REFUNDED',
		'EXPIRED'
	);
	`
}

func DropSwapOutcomeEnumSQL() string {
	return `DROP TYPE IF EXISTS "public"."swap_outcome";`
}
