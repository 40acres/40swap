// Original file: src/lnd/lightning.proto

export interface LookupHtlcResolutionResponse {
    settled?: boolean;
    offchain?: boolean;
}

export interface LookupHtlcResolutionResponse__Output {
    settled: boolean;
    offchain: boolean;
}
