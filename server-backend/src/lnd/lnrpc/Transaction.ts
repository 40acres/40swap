// Original file: src/lnd/lightning.proto

import type { OutputDetail as _lnrpc_OutputDetail, OutputDetail__Output as _lnrpc_OutputDetail__Output } from '../lnrpc/OutputDetail';
import type { PreviousOutPoint as _lnrpc_PreviousOutPoint, PreviousOutPoint__Output as _lnrpc_PreviousOutPoint__Output } from '../lnrpc/PreviousOutPoint';
import type { Long } from '@grpc/proto-loader';

export interface Transaction {
    txHash?: string;
    amount?: number | string | Long;
    numConfirmations?: number;
    blockHash?: string;
    blockHeight?: number;
    timeStamp?: number | string | Long;
    totalFees?: number | string | Long;
    destAddresses?: string[];
    rawTxHex?: string;
    label?: string;
    outputDetails?: _lnrpc_OutputDetail[];
    previousOutpoints?: _lnrpc_PreviousOutPoint[];
}

export interface Transaction__Output {
    txHash: string;
    amount: string;
    numConfirmations: number;
    blockHash: string;
    blockHeight: number;
    timeStamp: string;
    totalFees: string;
    destAddresses: string[];
    rawTxHex: string;
    label: string;
    outputDetails: _lnrpc_OutputDetail__Output[];
    previousOutpoints: _lnrpc_PreviousOutPoint__Output[];
}
