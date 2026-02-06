// Original file: src/lnd/lightning.proto

import type { OutPoint as _lnrpc_OutPoint, OutPoint__Output as _lnrpc_OutPoint__Output } from '../lnrpc/OutPoint';
import type { UpdateFailure as _lnrpc_UpdateFailure, UpdateFailure__Output as _lnrpc_UpdateFailure__Output } from '../lnrpc/UpdateFailure';

export interface FailedUpdate {
  'outpoint'?: (_lnrpc_OutPoint | null);
  'reason'?: (_lnrpc_UpdateFailure);
  'updateError'?: (string);
}

export interface FailedUpdate__Output {
  'outpoint': (_lnrpc_OutPoint__Output | null);
  'reason': (_lnrpc_UpdateFailure__Output);
  'updateError': (string);
}
