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
    amount: string;
    strategy: string;
}

export interface SwapInitiateResponse {
    swapId: string;
    message: string;
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
    amount: string;
    strategy: string;
    status: string;
    outcome: string | null;
    providerTxId: string | null;
    address: string | null;
    cost: string | null;
    errorMessage: string | null;
    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
}
