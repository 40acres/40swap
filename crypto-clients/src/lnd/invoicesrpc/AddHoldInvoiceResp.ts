// Original file: src/lnd/invoices.proto

import type { Long } from '@grpc/proto-loader';

export interface AddHoldInvoiceResp {
  'paymentRequest'?: (string);
  'addIndex'?: (number | string | Long);
  'paymentAddr'?: (Buffer | Uint8Array | string);
}

export interface AddHoldInvoiceResp__Output {
  'paymentRequest': (string);
  'addIndex': (string);
  'paymentAddr': (Buffer);
}
