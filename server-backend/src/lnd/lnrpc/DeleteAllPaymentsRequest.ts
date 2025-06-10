// Original file: src/lnd/lightning.proto

export interface DeleteAllPaymentsRequest {
    failedPaymentsOnly?: boolean;
    failedHtlcsOnly?: boolean;
    allPayments?: boolean;
}

export interface DeleteAllPaymentsRequest__Output {
    failedPaymentsOnly: boolean;
    failedHtlcsOnly: boolean;
    allPayments: boolean;
}
