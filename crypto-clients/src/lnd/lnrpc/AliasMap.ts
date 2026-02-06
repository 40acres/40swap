// Original file: src/lnd/lightning.proto

import type { Long } from '@grpc/proto-loader';

export interface AliasMap {
  'baseScid'?: (number | string | Long);
  'aliases'?: (number | string | Long)[];
}

export interface AliasMap__Output {
  'baseScid': (string);
  'aliases': (string)[];
}
