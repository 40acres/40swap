// Original file: src/lnd/lightning.proto

import type { MPPRecord as _lnrpc_MPPRecord, MPPRecord__Output as _lnrpc_MPPRecord__Output } from '../lnrpc/MPPRecord';
import type { AMPRecord as _lnrpc_AMPRecord, AMPRecord__Output as _lnrpc_AMPRecord__Output } from '../lnrpc/AMPRecord';
import type { Long } from '@grpc/proto-loader';

export interface Hop {
    chanId?: number | string | Long;
    chanCapacity?: number | string | Long;
    amtToForward?: number | string | Long;
    fee?: number | string | Long;
    expiry?: number;
    amtToForwardMsat?: number | string | Long;
    feeMsat?: number | string | Long;
    pubKey?: string;
    tlvPayload?: boolean;
    mppRecord?: _lnrpc_MPPRecord | null;
    customRecords?: { [key: number]: Buffer | Uint8Array | string };
    ampRecord?: _lnrpc_AMPRecord | null;
    metadata?: Buffer | Uint8Array | string;
    blindingPoint?: Buffer | Uint8Array | string;
    encryptedData?: Buffer | Uint8Array | string;
    totalAmtMsat?: number | string | Long;
}

export interface Hop__Output {
    chanId: string;
    chanCapacity: string;
    amtToForward: string;
    fee: string;
    expiry: number;
    amtToForwardMsat: string;
    feeMsat: string;
    pubKey: string;
    tlvPayload: boolean;
    mppRecord: _lnrpc_MPPRecord__Output | null;
    customRecords: { [key: number]: Buffer };
    ampRecord: _lnrpc_AMPRecord__Output | null;
    metadata: Buffer;
    blindingPoint: Buffer;
    encryptedData: Buffer;
    totalAmtMsat: string;
}
