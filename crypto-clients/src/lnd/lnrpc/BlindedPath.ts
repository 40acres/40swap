// Original file: src/lnd/lightning.proto

import type { BlindedHop as _lnrpc_BlindedHop, BlindedHop__Output as _lnrpc_BlindedHop__Output } from '../lnrpc/BlindedHop';

export interface BlindedPath {
  'introductionNode'?: (Buffer | Uint8Array | string);
  'blindingPoint'?: (Buffer | Uint8Array | string);
  'blindedHops'?: (_lnrpc_BlindedHop)[];
}

export interface BlindedPath__Output {
  'introductionNode': (Buffer);
  'blindingPoint': (Buffer);
  'blindedHops': (_lnrpc_BlindedHop__Output)[];
}
