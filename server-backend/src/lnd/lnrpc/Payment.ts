// Original file: src/lnd/lightning.proto

import type { HTLCAttempt as _lnrpc_HTLCAttempt, HTLCAttempt__Output as _lnrpc_HTLCAttempt__Output } from '../lnrpc/HTLCAttempt';
import type {
    PaymentFailureReason as _lnrpc_PaymentFailureReason,
    PaymentFailureReason__Output as _lnrpc_PaymentFailureReason__Output,
} from '../lnrpc/PaymentFailureReason';
import type { Long } from '@grpc/proto-loader';

// Original file: src/lnd/lightning.proto

export const _lnrpc_Payment_PaymentStatus = {
    UNKNOWN: 'UNKNOWN',
    IN_FLIGHT: 'IN_FLIGHT',
    SUCCEEDED: 'SUCCEEDED',
    FAILED: 'FAILED',
    INITIATED: 'INITIATED',
} as const;

export type _lnrpc_Payment_PaymentStatus = 'UNKNOWN' | 0 | 'IN_FLIGHT' | 1 | 'SUCCEEDED' | 2 | 'FAILED' | 3 | 'INITIATED' | 4;

export type _lnrpc_Payment_PaymentStatus__Output = (typeof _lnrpc_Payment_PaymentStatus)[keyof typeof _lnrpc_Payment_PaymentStatus];

export interface Payment {
    paymentHash?: string;
    value?: number | string | Long;
    creationDate?: number | string | Long;
    fee?: number | string | Long;
    paymentPreimage?: string;
    valueSat?: number | string | Long;
    valueMsat?: number | string | Long;
    paymentRequest?: string;
    status?: _lnrpc_Payment_PaymentStatus;
    feeSat?: number | string | Long;
    feeMsat?: number | string | Long;
    creationTimeNs?: number | string | Long;
    htlcs?: _lnrpc_HTLCAttempt[];
    paymentIndex?: number | string | Long;
    failureReason?: _lnrpc_PaymentFailureReason;
}

export interface Payment__Output {
    paymentHash: string;
    value: string;
    creationDate: string;
    fee: string;
    paymentPreimage: string;
    valueSat: string;
    valueMsat: string;
    paymentRequest: string;
    status: _lnrpc_Payment_PaymentStatus__Output;
    feeSat: string;
    feeMsat: string;
    creationTimeNs: string;
    htlcs: _lnrpc_HTLCAttempt__Output[];
    paymentIndex: string;
    failureReason: _lnrpc_PaymentFailureReason__Output;
}
