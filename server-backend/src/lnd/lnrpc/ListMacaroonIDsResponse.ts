// Original file: src/lnd/lightning.proto

import type { Long } from '@grpc/proto-loader';

export interface ListMacaroonIDsResponse {
    rootKeyIds?: (number | string | Long)[];
}

export interface ListMacaroonIDsResponse__Output {
    rootKeyIds: string[];
}
