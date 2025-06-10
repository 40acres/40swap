// Original file: src/lnd/lightning.proto

import type { CommitmentType as _lnrpc_CommitmentType, CommitmentType__Output as _lnrpc_CommitmentType__Output } from '../lnrpc/CommitmentType';
import type { Long } from '@grpc/proto-loader';

export interface BatchOpenChannel {
    nodePubkey?: Buffer | Uint8Array | string;
    localFundingAmount?: number | string | Long;
    pushSat?: number | string | Long;
    private?: boolean;
    minHtlcMsat?: number | string | Long;
    remoteCsvDelay?: number;
    closeAddress?: string;
    pendingChanId?: Buffer | Uint8Array | string;
    commitmentType?: _lnrpc_CommitmentType;
    remoteMaxValueInFlightMsat?: number | string | Long;
    remoteMaxHtlcs?: number;
    maxLocalCsv?: number;
    zeroConf?: boolean;
    scidAlias?: boolean;
    baseFee?: number | string | Long;
    feeRate?: number | string | Long;
    useBaseFee?: boolean;
    useFeeRate?: boolean;
    remoteChanReserveSat?: number | string | Long;
    memo?: string;
}

export interface BatchOpenChannel__Output {
    nodePubkey: Buffer;
    localFundingAmount: string;
    pushSat: string;
    private: boolean;
    minHtlcMsat: string;
    remoteCsvDelay: number;
    closeAddress: string;
    pendingChanId: Buffer;
    commitmentType: _lnrpc_CommitmentType__Output;
    remoteMaxValueInFlightMsat: string;
    remoteMaxHtlcs: number;
    maxLocalCsv: number;
    zeroConf: boolean;
    scidAlias: boolean;
    baseFee: string;
    feeRate: string;
    useBaseFee: boolean;
    useFeeRate: boolean;
    remoteChanReserveSat: string;
    memo: string;
}
