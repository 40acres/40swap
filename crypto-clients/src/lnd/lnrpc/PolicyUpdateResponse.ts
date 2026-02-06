// Original file: src/lnd/lightning.proto

import type { FailedUpdate as _lnrpc_FailedUpdate, FailedUpdate__Output as _lnrpc_FailedUpdate__Output } from '../lnrpc/FailedUpdate';

export interface PolicyUpdateResponse {
  'failedUpdates'?: (_lnrpc_FailedUpdate)[];
}

export interface PolicyUpdateResponse__Output {
  'failedUpdates': (_lnrpc_FailedUpdate__Output)[];
}
