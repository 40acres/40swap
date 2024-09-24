// Original file: src/lnd/invoices.proto

import type { LookupModifier as _invoicesrpc_LookupModifier, LookupModifier__Output as _invoicesrpc_LookupModifier__Output } from '../invoicesrpc/LookupModifier';

export interface LookupInvoiceMsg {
  'paymentHash'?: (Buffer | Uint8Array | string);
  'paymentAddr'?: (Buffer | Uint8Array | string);
  'setId'?: (Buffer | Uint8Array | string);
  'lookupModifier'?: (_invoicesrpc_LookupModifier);
  'invoiceRef'?: "paymentHash"|"paymentAddr"|"setId";
}

export interface LookupInvoiceMsg__Output {
  'paymentHash'?: (Buffer);
  'paymentAddr'?: (Buffer);
  'setId'?: (Buffer);
  'lookupModifier': (_invoicesrpc_LookupModifier__Output);
  'invoiceRef': "paymentHash"|"paymentAddr"|"setId";
}
