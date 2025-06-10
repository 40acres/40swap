// Original file: src/lnd/lightning.proto

import type { Initiator as _lnrpc_Initiator, Initiator__Output as _lnrpc_Initiator__Output } from '../lnrpc/Initiator';
import type { Resolution as _lnrpc_Resolution, Resolution__Output as _lnrpc_Resolution__Output } from '../lnrpc/Resolution';
import type { Long } from '@grpc/proto-loader';

// Original file: src/lnd/lightning.proto

export const _lnrpc_ChannelCloseSummary_ClosureType = {
    COOPERATIVE_CLOSE: 'COOPERATIVE_CLOSE',
    LOCAL_FORCE_CLOSE: 'LOCAL_FORCE_CLOSE',
    REMOTE_FORCE_CLOSE: 'REMOTE_FORCE_CLOSE',
    BREACH_CLOSE: 'BREACH_CLOSE',
    FUNDING_CANCELED: 'FUNDING_CANCELED',
    ABANDONED: 'ABANDONED',
} as const;

export type _lnrpc_ChannelCloseSummary_ClosureType =
    | 'COOPERATIVE_CLOSE'
    | 0
    | 'LOCAL_FORCE_CLOSE'
    | 1
    | 'REMOTE_FORCE_CLOSE'
    | 2
    | 'BREACH_CLOSE'
    | 3
    | 'FUNDING_CANCELED'
    | 4
    | 'ABANDONED'
    | 5;

export type _lnrpc_ChannelCloseSummary_ClosureType__Output =
    (typeof _lnrpc_ChannelCloseSummary_ClosureType)[keyof typeof _lnrpc_ChannelCloseSummary_ClosureType];

export interface ChannelCloseSummary {
    channelPoint?: string;
    chanId?: number | string | Long;
    chainHash?: string;
    closingTxHash?: string;
    remotePubkey?: string;
    capacity?: number | string | Long;
    closeHeight?: number;
    settledBalance?: number | string | Long;
    timeLockedBalance?: number | string | Long;
    closeType?: _lnrpc_ChannelCloseSummary_ClosureType;
    openInitiator?: _lnrpc_Initiator;
    closeInitiator?: _lnrpc_Initiator;
    resolutions?: _lnrpc_Resolution[];
    aliasScids?: (number | string | Long)[];
    zeroConfConfirmedScid?: number | string | Long;
}

export interface ChannelCloseSummary__Output {
    channelPoint: string;
    chanId: string;
    chainHash: string;
    closingTxHash: string;
    remotePubkey: string;
    capacity: string;
    closeHeight: number;
    settledBalance: string;
    timeLockedBalance: string;
    closeType: _lnrpc_ChannelCloseSummary_ClosureType__Output;
    openInitiator: _lnrpc_Initiator__Output;
    closeInitiator: _lnrpc_Initiator__Output;
    resolutions: _lnrpc_Resolution__Output[];
    aliasScids: string[];
    zeroConfConfirmedScid: string;
}
