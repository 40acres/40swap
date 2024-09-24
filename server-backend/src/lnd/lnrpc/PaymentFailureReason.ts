// Original file: src/lnd/lightning.proto

export const PaymentFailureReason = {
  FAILURE_REASON_NONE: 'FAILURE_REASON_NONE',
  FAILURE_REASON_TIMEOUT: 'FAILURE_REASON_TIMEOUT',
  FAILURE_REASON_NO_ROUTE: 'FAILURE_REASON_NO_ROUTE',
  FAILURE_REASON_ERROR: 'FAILURE_REASON_ERROR',
  FAILURE_REASON_INCORRECT_PAYMENT_DETAILS: 'FAILURE_REASON_INCORRECT_PAYMENT_DETAILS',
  FAILURE_REASON_INSUFFICIENT_BALANCE: 'FAILURE_REASON_INSUFFICIENT_BALANCE',
} as const;

export type PaymentFailureReason =
  | 'FAILURE_REASON_NONE'
  | 0
  | 'FAILURE_REASON_TIMEOUT'
  | 1
  | 'FAILURE_REASON_NO_ROUTE'
  | 2
  | 'FAILURE_REASON_ERROR'
  | 3
  | 'FAILURE_REASON_INCORRECT_PAYMENT_DETAILS'
  | 4
  | 'FAILURE_REASON_INSUFFICIENT_BALANCE'
  | 5

export type PaymentFailureReason__Output = typeof PaymentFailureReason[keyof typeof PaymentFailureReason]
