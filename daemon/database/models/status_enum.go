package models

import (
	"database/sql/driver"
	"fmt"
)

type SwapStatus string

const (
	// happy path
	StatusCreated                      SwapStatus = "CREATED"
	StatusInvoicePaymentIntentReceived SwapStatus = "INVOICE_PAYMENT_INTENT_RECEIVED"
	StatusFundedUnconfirmed            SwapStatus = "CONTRACT_FUNDED_UNCONFIRMED"
	StatusFunded                       SwapStatus = "CONTRACT_FUNDED"
	StatusInvoicePaid                  SwapStatus = "INVOICE_PAID"
	StatusContractClaimedUnconfirmed   SwapStatus = "CONTRACT_CLAIMED_UNCONFIRMED"
	StatusDone                         SwapStatus = "DONE"
	// if it expires after CONTRACT_FUNDED
	StatusContractRefundedUnconfirmed SwapStatus = "CONTRACT_REFUNDED_UNCONFIRMED"
	StatusContractExpired             SwapStatus = "CONTRACT_EXPIRED"
)

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

func CreateSwapStatusEnumSQL() string {
	return `CREATE TYPE "public"."swap_status" AS ENUM (
		'CREATED',
		'INVOICE_PAYMENT_INTENT_RECEIVED',
		'CONTRACT_FUNDED_UNCONFIRMED',
		'CONTRACT_FUNDED',
		'INVOICE_PAID',
		'CONTRACT_CLAIMED_UNCONFIRMED',
		'DONE',
		'CONTRACT_REFUNDED_UNCONFIRMED',
		'CONTRACT_EXPIRED'
	);
	`
}

func DropSwapStatusEnumSQL() string {
	return `DROP TYPE "public"."swap_status";`
}
