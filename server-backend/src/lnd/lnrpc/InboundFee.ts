// Original file: src/lnd/lightning.proto

export interface InboundFee {
    baseFeeMsat?: number;
    feeRatePpm?: number;
}

export interface InboundFee__Output {
    baseFeeMsat: number;
    feeRatePpm: number;
}
