// Original file: src/lnd/lightning.proto

export interface FundingShimCancel {
    pendingChanId?: Buffer | Uint8Array | string;
}

export interface FundingShimCancel__Output {
    pendingChanId: Buffer;
}
