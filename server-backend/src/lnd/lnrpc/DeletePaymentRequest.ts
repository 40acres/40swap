// Original file: src/lnd/lightning.proto

export interface DeletePaymentRequest {
    paymentHash?: Buffer | Uint8Array | string;
    failedHtlcsOnly?: boolean;
}

export interface DeletePaymentRequest__Output {
    paymentHash: Buffer;
    failedHtlcsOnly: boolean;
}
