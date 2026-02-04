export interface ChannelInfo {
    channelId: string;
    capacity: string;
    localBalance: string;
    remoteBalance: string;
    active: boolean;
    remotePubkey: string;
    channelPoint: string;
    peerAlias: string;
}

export interface SwapRequest {
    channelId: string;
    amountSats: number;
}

export interface SwapResult {
    success: boolean;
    txid?: string;
    liquidAddress?: string;
    error?: string;
}

export interface SwapHistory {
    id: string;
    channelId: string;
    peerAlias: string;
    remotePubkey: string;
    amountSats: string;
    status: string;
    outcome: string | null;
    bitfinexTxId: string | null;
    liquidAddress: string | null;
    costSats: string | null;
    errorMessage: string | null;
    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
}
