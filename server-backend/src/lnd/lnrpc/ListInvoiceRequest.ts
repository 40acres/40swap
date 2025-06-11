// Original file: src/lnd/lightning.proto

import type { Long } from '@grpc/proto-loader';

export interface ListInvoiceRequest {
    pendingOnly?: boolean;
    indexOffset?: number | string | Long;
    numMaxInvoices?: number | string | Long;
    reversed?: boolean;
    creationDateStart?: number | string | Long;
    creationDateEnd?: number | string | Long;
}

export interface ListInvoiceRequest__Output {
    pendingOnly: boolean;
    indexOffset: string;
    numMaxInvoices: string;
    reversed: boolean;
    creationDateStart: string;
    creationDateEnd: string;
}
