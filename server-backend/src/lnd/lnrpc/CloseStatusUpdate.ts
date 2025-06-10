// Original file: src/lnd/lightning.proto

import type { PendingUpdate as _lnrpc_PendingUpdate, PendingUpdate__Output as _lnrpc_PendingUpdate__Output } from '../lnrpc/PendingUpdate';
import type {
    ChannelCloseUpdate as _lnrpc_ChannelCloseUpdate,
    ChannelCloseUpdate__Output as _lnrpc_ChannelCloseUpdate__Output,
} from '../lnrpc/ChannelCloseUpdate';
import type { InstantUpdate as _lnrpc_InstantUpdate, InstantUpdate__Output as _lnrpc_InstantUpdate__Output } from '../lnrpc/InstantUpdate';

export interface CloseStatusUpdate {
    closePending?: _lnrpc_PendingUpdate | null;
    chanClose?: _lnrpc_ChannelCloseUpdate | null;
    closeInstant?: _lnrpc_InstantUpdate | null;
    update?: 'closePending' | 'chanClose' | 'closeInstant';
}

export interface CloseStatusUpdate__Output {
    closePending?: _lnrpc_PendingUpdate__Output | null;
    chanClose?: _lnrpc_ChannelCloseUpdate__Output | null;
    closeInstant?: _lnrpc_InstantUpdate__Output | null;
    update: 'closePending' | 'chanClose' | 'closeInstant';
}
