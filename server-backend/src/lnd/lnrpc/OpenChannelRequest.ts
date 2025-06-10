// Original file: src/lnd/lightning.proto

import type { FundingShim as _lnrpc_FundingShim, FundingShim__Output as _lnrpc_FundingShim__Output } from '../lnrpc/FundingShim';
import type { CommitmentType as _lnrpc_CommitmentType, CommitmentType__Output as _lnrpc_CommitmentType__Output } from '../lnrpc/CommitmentType';
import type { OutPoint as _lnrpc_OutPoint, OutPoint__Output as _lnrpc_OutPoint__Output } from '../lnrpc/OutPoint';
import type { Long } from '@grpc/proto-loader';

export interface OpenChannelRequest {
    satPerVbyte?: number | string | Long;
    nodePubkey?: Buffer | Uint8Array | string;
    nodePubkeyString?: string;
    localFundingAmount?: number | string | Long;
    pushSat?: number | string | Long;
    targetConf?: number;
    satPerByte?: number | string | Long;
    private?: boolean;
    minHtlcMsat?: number | string | Long;
    remoteCsvDelay?: number;
    minConfs?: number;
    spendUnconfirmed?: boolean;
    closeAddress?: string;
    fundingShim?: _lnrpc_FundingShim | null;
    remoteMaxValueInFlightMsat?: number | string | Long;
    remoteMaxHtlcs?: number;
    maxLocalCsv?: number;
    commitmentType?: _lnrpc_CommitmentType;
    zeroConf?: boolean;
    scidAlias?: boolean;
    baseFee?: number | string | Long;
    feeRate?: number | string | Long;
    useBaseFee?: boolean;
    useFeeRate?: boolean;
    remoteChanReserveSat?: number | string | Long;
    fundMax?: boolean;
    memo?: string;
    outpoints?: _lnrpc_OutPoint[];
}

export interface OpenChannelRequest__Output {
    satPerVbyte: string;
    nodePubkey: Buffer;
    nodePubkeyString: string;
    localFundingAmount: string;
    pushSat: string;
    targetConf: number;
    satPerByte: string;
    private: boolean;
    minHtlcMsat: string;
    remoteCsvDelay: number;
    minConfs: number;
    spendUnconfirmed: boolean;
    closeAddress: string;
    fundingShim: _lnrpc_FundingShim__Output | null;
    remoteMaxValueInFlightMsat: string;
    remoteMaxHtlcs: number;
    maxLocalCsv: number;
    commitmentType: _lnrpc_CommitmentType__Output;
    zeroConf: boolean;
    scidAlias: boolean;
    baseFee: string;
    feeRate: string;
    useBaseFee: boolean;
    useFeeRate: boolean;
    remoteChanReserveSat: string;
    fundMax: boolean;
    memo: string;
    outpoints: _lnrpc_OutPoint__Output[];
}
