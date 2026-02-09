// Original file: src/lnd/lightning.proto

import type { CoinSelectionStrategy as _lnrpc_CoinSelectionStrategy, CoinSelectionStrategy__Output as _lnrpc_CoinSelectionStrategy__Output } from '../lnrpc/CoinSelectionStrategy';
import type { Long } from '@grpc/proto-loader';

export interface EstimateFeeRequest {
  'AddrToAmount'?: ({[key: string]: number | string | Long});
  'targetConf'?: (number);
  'minConfs'?: (number);
  'spendUnconfirmed'?: (boolean);
  'coinSelectionStrategy'?: (_lnrpc_CoinSelectionStrategy);
}

export interface EstimateFeeRequest__Output {
  'AddrToAmount': ({[key: string]: string});
  'targetConf': (number);
  'minConfs': (number);
  'spendUnconfirmed': (boolean);
  'coinSelectionStrategy': (_lnrpc_CoinSelectionStrategy__Output);
}
