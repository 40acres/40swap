// Original file: src/lnd/lightning.proto

import type {
    MacaroonPermission as _lnrpc_MacaroonPermission,
    MacaroonPermission__Output as _lnrpc_MacaroonPermission__Output,
} from '../lnrpc/MacaroonPermission';
import type { Long } from '@grpc/proto-loader';

export interface BakeMacaroonRequest {
    permissions?: _lnrpc_MacaroonPermission[];
    rootKeyId?: number | string | Long;
    allowExternalPermissions?: boolean;
}

export interface BakeMacaroonRequest__Output {
    permissions: _lnrpc_MacaroonPermission__Output[];
    rootKeyId: string;
    allowExternalPermissions: boolean;
}
