// Original file: src/lnd/lightning.proto

import type { Long } from '@grpc/proto-loader';

export interface LookupHtlcResolutionRequest {
  'chanId'?: (number | string | Long);
  'htlcIndex'?: (number | string | Long);
}

export interface LookupHtlcResolutionRequest__Output {
  'chanId': (string);
  'htlcIndex': (string);
}
