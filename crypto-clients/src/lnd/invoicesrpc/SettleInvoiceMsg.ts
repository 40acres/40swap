// Original file: src/lnd/invoices.proto


export interface SettleInvoiceMsg {
  'preimage'?: (Buffer | Uint8Array | string);
}

export interface SettleInvoiceMsg__Output {
  'preimage': (Buffer);
}
