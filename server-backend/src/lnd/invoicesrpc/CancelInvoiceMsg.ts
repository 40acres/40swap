// Original file: src/lnd/invoices.proto

export interface CancelInvoiceMsg {
    paymentHash?: Buffer | Uint8Array | string;
}

export interface CancelInvoiceMsg__Output {
    paymentHash: Buffer;
}
