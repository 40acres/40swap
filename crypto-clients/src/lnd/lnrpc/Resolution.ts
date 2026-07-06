// Original file: src/lnd/lightning.proto

import type { ResolutionType as _lnrpc_ResolutionType, ResolutionType__Output as _lnrpc_ResolutionType__Output } from '../lnrpc/ResolutionType';
import type { ResolutionOutcome as _lnrpc_ResolutionOutcome, ResolutionOutcome__Output as _lnrpc_ResolutionOutcome__Output } from '../lnrpc/ResolutionOutcome';
import type { OutPoint as _lnrpc_OutPoint, OutPoint__Output as _lnrpc_OutPoint__Output } from '../lnrpc/OutPoint';
import type { Long } from '@grpc/proto-loader';

export interface Resolution {
  'resolutionType'?: (_lnrpc_ResolutionType);
  'outcome'?: (_lnrpc_ResolutionOutcome);
  'outpoint'?: (_lnrpc_OutPoint | null);
  'amountSat'?: (number | string | Long);
  'sweepTxid'?: (string);
}

export interface Resolution__Output {
  'resolutionType': (_lnrpc_ResolutionType__Output);
  'outcome': (_lnrpc_ResolutionOutcome__Output);
  'outpoint': (_lnrpc_OutPoint__Output | null);
  'amountSat': (string);
  'sweepTxid': (string);
}
