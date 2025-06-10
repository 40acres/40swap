// Original file: src/lnd/lightning.proto

import type {
    CoinSelectionStrategy as _lnrpc_CoinSelectionStrategy,
    CoinSelectionStrategy__Output as _lnrpc_CoinSelectionStrategy__Output,
} from '../lnrpc/CoinSelectionStrategy';
import type { Long } from '@grpc/proto-loader';

export interface SendCoinsRequest {
    addr?: string;
    amount?: number | string | Long;
    targetConf?: number;
    satPerVbyte?: number | string | Long;
    satPerByte?: number | string | Long;
    sendAll?: boolean;
    label?: string;
    minConfs?: number;
    spendUnconfirmed?: boolean;
    coinSelectionStrategy?: _lnrpc_CoinSelectionStrategy;
}

export interface SendCoinsRequest__Output {
    addr: string;
    amount: string;
    targetConf: number;
    satPerVbyte: string;
    satPerByte: string;
    sendAll: boolean;
    label: string;
    minConfs: number;
    spendUnconfirmed: boolean;
    coinSelectionStrategy: _lnrpc_CoinSelectionStrategy__Output;
}
