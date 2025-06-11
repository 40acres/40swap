// Original file: src/lnd/lightning.proto

import type { Channel as _lnrpc_Channel, Channel__Output as _lnrpc_Channel__Output } from '../lnrpc/Channel';
import type {
    ChannelCloseSummary as _lnrpc_ChannelCloseSummary,
    ChannelCloseSummary__Output as _lnrpc_ChannelCloseSummary__Output,
} from '../lnrpc/ChannelCloseSummary';
import type { ChannelPoint as _lnrpc_ChannelPoint, ChannelPoint__Output as _lnrpc_ChannelPoint__Output } from '../lnrpc/ChannelPoint';
import type { PendingUpdate as _lnrpc_PendingUpdate, PendingUpdate__Output as _lnrpc_PendingUpdate__Output } from '../lnrpc/PendingUpdate';

// Original file: src/lnd/lightning.proto

export const _lnrpc_ChannelEventUpdate_UpdateType = {
    OPEN_CHANNEL: 'OPEN_CHANNEL',
    CLOSED_CHANNEL: 'CLOSED_CHANNEL',
    ACTIVE_CHANNEL: 'ACTIVE_CHANNEL',
    INACTIVE_CHANNEL: 'INACTIVE_CHANNEL',
    PENDING_OPEN_CHANNEL: 'PENDING_OPEN_CHANNEL',
    FULLY_RESOLVED_CHANNEL: 'FULLY_RESOLVED_CHANNEL',
} as const;

export type _lnrpc_ChannelEventUpdate_UpdateType =
    | 'OPEN_CHANNEL'
    | 0
    | 'CLOSED_CHANNEL'
    | 1
    | 'ACTIVE_CHANNEL'
    | 2
    | 'INACTIVE_CHANNEL'
    | 3
    | 'PENDING_OPEN_CHANNEL'
    | 4
    | 'FULLY_RESOLVED_CHANNEL'
    | 5;

export type _lnrpc_ChannelEventUpdate_UpdateType__Output = (typeof _lnrpc_ChannelEventUpdate_UpdateType)[keyof typeof _lnrpc_ChannelEventUpdate_UpdateType];

export interface ChannelEventUpdate {
    openChannel?: _lnrpc_Channel | null;
    closedChannel?: _lnrpc_ChannelCloseSummary | null;
    activeChannel?: _lnrpc_ChannelPoint | null;
    inactiveChannel?: _lnrpc_ChannelPoint | null;
    type?: _lnrpc_ChannelEventUpdate_UpdateType;
    pendingOpenChannel?: _lnrpc_PendingUpdate | null;
    fullyResolvedChannel?: _lnrpc_ChannelPoint | null;
    channel?: 'openChannel' | 'closedChannel' | 'activeChannel' | 'inactiveChannel' | 'pendingOpenChannel' | 'fullyResolvedChannel';
}

export interface ChannelEventUpdate__Output {
    openChannel?: _lnrpc_Channel__Output | null;
    closedChannel?: _lnrpc_ChannelCloseSummary__Output | null;
    activeChannel?: _lnrpc_ChannelPoint__Output | null;
    inactiveChannel?: _lnrpc_ChannelPoint__Output | null;
    type: _lnrpc_ChannelEventUpdate_UpdateType__Output;
    pendingOpenChannel?: _lnrpc_PendingUpdate__Output | null;
    fullyResolvedChannel?: _lnrpc_ChannelPoint__Output | null;
    channel: 'openChannel' | 'closedChannel' | 'activeChannel' | 'inactiveChannel' | 'pendingOpenChannel' | 'fullyResolvedChannel';
}
