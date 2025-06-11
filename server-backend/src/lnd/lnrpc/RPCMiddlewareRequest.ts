// Original file: src/lnd/lightning.proto

import type { StreamAuth as _lnrpc_StreamAuth, StreamAuth__Output as _lnrpc_StreamAuth__Output } from '../lnrpc/StreamAuth';
import type { RPCMessage as _lnrpc_RPCMessage, RPCMessage__Output as _lnrpc_RPCMessage__Output } from '../lnrpc/RPCMessage';
import type { Long } from '@grpc/proto-loader';

export interface RPCMiddlewareRequest {
    requestId?: number | string | Long;
    rawMacaroon?: Buffer | Uint8Array | string;
    customCaveatCondition?: string;
    streamAuth?: _lnrpc_StreamAuth | null;
    request?: _lnrpc_RPCMessage | null;
    response?: _lnrpc_RPCMessage | null;
    msgId?: number | string | Long;
    regComplete?: boolean;
    interceptType?: 'streamAuth' | 'request' | 'response' | 'regComplete';
}

export interface RPCMiddlewareRequest__Output {
    requestId: string;
    rawMacaroon: Buffer;
    customCaveatCondition: string;
    streamAuth?: _lnrpc_StreamAuth__Output | null;
    request?: _lnrpc_RPCMessage__Output | null;
    response?: _lnrpc_RPCMessage__Output | null;
    msgId: string;
    regComplete?: boolean;
    interceptType: 'streamAuth' | 'request' | 'response' | 'regComplete';
}
