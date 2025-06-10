// Original file: src/lnd/lightning.proto

export interface SignMessageRequest {
    msg?: Buffer | Uint8Array | string;
    singleHash?: boolean;
}

export interface SignMessageRequest__Output {
    msg: Buffer;
    singleHash: boolean;
}
