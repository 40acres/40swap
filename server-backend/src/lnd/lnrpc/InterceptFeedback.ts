// Original file: src/lnd/lightning.proto

export interface InterceptFeedback {
    error?: string;
    replaceResponse?: boolean;
    replacementSerialized?: Buffer | Uint8Array | string;
}

export interface InterceptFeedback__Output {
    error: string;
    replaceResponse: boolean;
    replacementSerialized: Buffer;
}
