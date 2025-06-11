// Original file: src/lnd/lightning.proto

export interface GetDebugInfoResponse {
    config?: { [key: string]: string };
    log?: string[];
}

export interface GetDebugInfoResponse__Output {
    config: { [key: string]: string };
    log: string[];
}
