// Original file: src/lnd/lightning.proto

import type { Long } from '@grpc/proto-loader';

export interface ListPaymentsRequest {
    includeIncomplete?: boolean;
    indexOffset?: number | string | Long;
    maxPayments?: number | string | Long;
    reversed?: boolean;
    countTotalPayments?: boolean;
    creationDateStart?: number | string | Long;
    creationDateEnd?: number | string | Long;
}

export interface ListPaymentsRequest__Output {
    includeIncomplete: boolean;
    indexOffset: string;
    maxPayments: string;
    reversed: boolean;
    countTotalPayments: boolean;
    creationDateStart: string;
    creationDateEnd: string;
}
