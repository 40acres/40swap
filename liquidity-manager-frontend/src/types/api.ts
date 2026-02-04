export interface ChannelInfo {
    channelId: string;
    capacity: string;
    localBalance: string;
    remoteBalance: string;
    active: boolean;
    remotePubkey: string;
    channelPoint: string;
}

export interface SwapRequest {
    channelId: string;
    amountSats: number;
}

export interface SwapResult {
    success: boolean;
    txid?: string;
    error?: string;
}
