// Original file: src/lnd/lightning.proto

import type { PendingUpdate as _lnrpc_PendingUpdate, PendingUpdate__Output as _lnrpc_PendingUpdate__Output } from '../lnrpc/PendingUpdate';

export interface BatchOpenChannelResponse {
    pendingChannels?: _lnrpc_PendingUpdate[];
}

export interface BatchOpenChannelResponse__Output {
    pendingChannels: _lnrpc_PendingUpdate__Output[];
}
