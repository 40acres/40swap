// Original file: src/lnd/lightning.proto

import type { Initiator as _lnrpc_Initiator, Initiator__Output as _lnrpc_Initiator__Output } from '../lnrpc/Initiator';
import type { CommitmentType as _lnrpc_CommitmentType, CommitmentType__Output as _lnrpc_CommitmentType__Output } from '../lnrpc/CommitmentType';
import type { PendingHTLC as _lnrpc_PendingHTLC, PendingHTLC__Output as _lnrpc_PendingHTLC__Output } from '../lnrpc/PendingHTLC';
import type { Long } from '@grpc/proto-loader';

// Original file: src/lnd/lightning.proto

export const _lnrpc_PendingChannelsResponse_ForceClosedChannel_AnchorState = {
  LIMBO: 'LIMBO',
  RECOVERED: 'RECOVERED',
  LOST: 'LOST',
} as const;

export type _lnrpc_PendingChannelsResponse_ForceClosedChannel_AnchorState =
  | 'LIMBO'
  | 0
  | 'RECOVERED'
  | 1
  | 'LOST'
  | 2

export type _lnrpc_PendingChannelsResponse_ForceClosedChannel_AnchorState__Output = typeof _lnrpc_PendingChannelsResponse_ForceClosedChannel_AnchorState[keyof typeof _lnrpc_PendingChannelsResponse_ForceClosedChannel_AnchorState]

export interface _lnrpc_PendingChannelsResponse_ClosedChannel {
  'channel'?: (_lnrpc_PendingChannelsResponse_PendingChannel | null);
  'closingTxid'?: (string);
}

export interface _lnrpc_PendingChannelsResponse_ClosedChannel__Output {
  'channel': (_lnrpc_PendingChannelsResponse_PendingChannel__Output | null);
  'closingTxid': (string);
}

export interface _lnrpc_PendingChannelsResponse_Commitments {
  'localTxid'?: (string);
  'remoteTxid'?: (string);
  'remotePendingTxid'?: (string);
  'localCommitFeeSat'?: (number | string | Long);
  'remoteCommitFeeSat'?: (number | string | Long);
  'remotePendingCommitFeeSat'?: (number | string | Long);
}

export interface _lnrpc_PendingChannelsResponse_Commitments__Output {
  'localTxid': (string);
  'remoteTxid': (string);
  'remotePendingTxid': (string);
  'localCommitFeeSat': (string);
  'remoteCommitFeeSat': (string);
  'remotePendingCommitFeeSat': (string);
}

export interface _lnrpc_PendingChannelsResponse_ForceClosedChannel {
  'channel'?: (_lnrpc_PendingChannelsResponse_PendingChannel | null);
  'closingTxid'?: (string);
  'limboBalance'?: (number | string | Long);
  'maturityHeight'?: (number);
  'blocksTilMaturity'?: (number);
  'recoveredBalance'?: (number | string | Long);
  'pendingHtlcs'?: (_lnrpc_PendingHTLC)[];
  'anchor'?: (_lnrpc_PendingChannelsResponse_ForceClosedChannel_AnchorState);
}

export interface _lnrpc_PendingChannelsResponse_ForceClosedChannel__Output {
  'channel': (_lnrpc_PendingChannelsResponse_PendingChannel__Output | null);
  'closingTxid': (string);
  'limboBalance': (string);
  'maturityHeight': (number);
  'blocksTilMaturity': (number);
  'recoveredBalance': (string);
  'pendingHtlcs': (_lnrpc_PendingHTLC__Output)[];
  'anchor': (_lnrpc_PendingChannelsResponse_ForceClosedChannel_AnchorState__Output);
}

export interface _lnrpc_PendingChannelsResponse_PendingChannel {
  'remoteNodePub'?: (string);
  'channelPoint'?: (string);
  'capacity'?: (number | string | Long);
  'localBalance'?: (number | string | Long);
  'remoteBalance'?: (number | string | Long);
  'localChanReserveSat'?: (number | string | Long);
  'remoteChanReserveSat'?: (number | string | Long);
  'initiator'?: (_lnrpc_Initiator);
  'commitmentType'?: (_lnrpc_CommitmentType);
  'numForwardingPackages'?: (number | string | Long);
  'chanStatusFlags'?: (string);
  'private'?: (boolean);
  'memo'?: (string);
}

export interface _lnrpc_PendingChannelsResponse_PendingChannel__Output {
  'remoteNodePub': (string);
  'channelPoint': (string);
  'capacity': (string);
  'localBalance': (string);
  'remoteBalance': (string);
  'localChanReserveSat': (string);
  'remoteChanReserveSat': (string);
  'initiator': (_lnrpc_Initiator__Output);
  'commitmentType': (_lnrpc_CommitmentType__Output);
  'numForwardingPackages': (string);
  'chanStatusFlags': (string);
  'private': (boolean);
  'memo': (string);
}

export interface _lnrpc_PendingChannelsResponse_PendingOpenChannel {
  'channel'?: (_lnrpc_PendingChannelsResponse_PendingChannel | null);
  'commitFee'?: (number | string | Long);
  'commitWeight'?: (number | string | Long);
  'feePerKw'?: (number | string | Long);
  'fundingExpiryBlocks'?: (number);
}

export interface _lnrpc_PendingChannelsResponse_PendingOpenChannel__Output {
  'channel': (_lnrpc_PendingChannelsResponse_PendingChannel__Output | null);
  'commitFee': (string);
  'commitWeight': (string);
  'feePerKw': (string);
  'fundingExpiryBlocks': (number);
}

export interface _lnrpc_PendingChannelsResponse_WaitingCloseChannel {
  'channel'?: (_lnrpc_PendingChannelsResponse_PendingChannel | null);
  'limboBalance'?: (number | string | Long);
  'commitments'?: (_lnrpc_PendingChannelsResponse_Commitments | null);
  'closingTxid'?: (string);
  'closingTxHex'?: (string);
}

export interface _lnrpc_PendingChannelsResponse_WaitingCloseChannel__Output {
  'channel': (_lnrpc_PendingChannelsResponse_PendingChannel__Output | null);
  'limboBalance': (string);
  'commitments': (_lnrpc_PendingChannelsResponse_Commitments__Output | null);
  'closingTxid': (string);
  'closingTxHex': (string);
}

export interface PendingChannelsResponse {
  'totalLimboBalance'?: (number | string | Long);
  'pendingOpenChannels'?: (_lnrpc_PendingChannelsResponse_PendingOpenChannel)[];
  'pendingClosingChannels'?: (_lnrpc_PendingChannelsResponse_ClosedChannel)[];
  'pendingForceClosingChannels'?: (_lnrpc_PendingChannelsResponse_ForceClosedChannel)[];
  'waitingCloseChannels'?: (_lnrpc_PendingChannelsResponse_WaitingCloseChannel)[];
}

export interface PendingChannelsResponse__Output {
  'totalLimboBalance': (string);
  'pendingOpenChannels': (_lnrpc_PendingChannelsResponse_PendingOpenChannel__Output)[];
  'pendingClosingChannels': (_lnrpc_PendingChannelsResponse_ClosedChannel__Output)[];
  'pendingForceClosingChannels': (_lnrpc_PendingChannelsResponse_ForceClosedChannel__Output)[];
  'waitingCloseChannels': (_lnrpc_PendingChannelsResponse_WaitingCloseChannel__Output)[];
}
