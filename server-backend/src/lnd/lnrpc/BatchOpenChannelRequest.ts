// Original file: src/lnd/lightning.proto

import type { BatchOpenChannel as _lnrpc_BatchOpenChannel, BatchOpenChannel__Output as _lnrpc_BatchOpenChannel__Output } from '../lnrpc/BatchOpenChannel';
import type {
    CoinSelectionStrategy as _lnrpc_CoinSelectionStrategy,
    CoinSelectionStrategy__Output as _lnrpc_CoinSelectionStrategy__Output,
} from '../lnrpc/CoinSelectionStrategy';
import type { Long } from '@grpc/proto-loader';

export interface BatchOpenChannelRequest {
    channels?: _lnrpc_BatchOpenChannel[];
    targetConf?: number;
    satPerVbyte?: number | string | Long;
    minConfs?: number;
    spendUnconfirmed?: boolean;
    label?: string;
    coinSelectionStrategy?: _lnrpc_CoinSelectionStrategy;
}

export interface BatchOpenChannelRequest__Output {
    channels: _lnrpc_BatchOpenChannel__Output[];
    targetConf: number;
    satPerVbyte: string;
    minConfs: number;
    spendUnconfirmed: boolean;
    label: string;
    coinSelectionStrategy: _lnrpc_CoinSelectionStrategy__Output;
}
