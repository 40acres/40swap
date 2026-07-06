// Original file: src/lnd/lightning.proto

import type { Route as _lnrpc_Route, Route__Output as _lnrpc_Route__Output } from '../lnrpc/Route';
import type { Failure as _lnrpc_Failure, Failure__Output as _lnrpc_Failure__Output } from '../lnrpc/Failure';
import type { Long } from '@grpc/proto-loader';

// Original file: src/lnd/lightning.proto

export const _lnrpc_HTLCAttempt_HTLCStatus = {
  IN_FLIGHT: 'IN_FLIGHT',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
} as const;

export type _lnrpc_HTLCAttempt_HTLCStatus =
  | 'IN_FLIGHT'
  | 0
  | 'SUCCEEDED'
  | 1
  | 'FAILED'
  | 2

export type _lnrpc_HTLCAttempt_HTLCStatus__Output = typeof _lnrpc_HTLCAttempt_HTLCStatus[keyof typeof _lnrpc_HTLCAttempt_HTLCStatus]

export interface HTLCAttempt {
  'status'?: (_lnrpc_HTLCAttempt_HTLCStatus);
  'route'?: (_lnrpc_Route | null);
  'attemptTimeNs'?: (number | string | Long);
  'resolveTimeNs'?: (number | string | Long);
  'failure'?: (_lnrpc_Failure | null);
  'preimage'?: (Buffer | Uint8Array | string);
  'attemptId'?: (number | string | Long);
}

export interface HTLCAttempt__Output {
  'status': (_lnrpc_HTLCAttempt_HTLCStatus__Output);
  'route': (_lnrpc_Route__Output | null);
  'attemptTimeNs': (string);
  'resolveTimeNs': (string);
  'failure': (_lnrpc_Failure__Output | null);
  'preimage': (Buffer);
  'attemptId': (string);
}
