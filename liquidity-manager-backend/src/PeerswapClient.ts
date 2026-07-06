import { Logger } from '@nestjs/common';
import { z } from 'zod';

const peerswapSwapSchema = z.object({
    id: z.string(),
    created_at: z.string(),
    asset: z.string(),
    type: z.string(),
    role: z.string(),
    state: z.string(),
    initiator_node_id: z.string(),
    peer_node_id: z.string(),
    amount: z.string(),
    channel_id: z.string(),
    opening_tx_id: z.string().optional(),
    claim_tx_id: z.string().optional(),
    cancel_message: z.string().optional(),
    lnd_chan_id: z.string().optional(),
});

export type PeerswapSwap = z.infer<typeof peerswapSwapSchema>;

const swapResponseSchema = z.object({
    swap: peerswapSwapSchema,
});

const swapStatsSchema = z.object({
    swaps_out: z.string(),
    swaps_in: z.string(),
    sats_out: z.string(),
    sats_in: z.string(),
});

const peerswapPeerSchema = z.object({
    node_id: z.string(),
    swaps_allowed: z.boolean(),
    supported_assets: z.array(z.string()),
    channels: z.array(
        z.object({
            channel_id: z.string(),
            local_balance: z.string(),
            remote_balance: z.string(),
            active: z.boolean(),
            short_channel_id: z.string(),
        }),
    ),
    as_sender: swapStatsSchema,
    as_receiver: swapStatsSchema,
    paid_fee: z.string(),
});

export type PeerswapPeer = z.infer<typeof peerswapPeerSchema>;

const listSwapsResponseSchema = z.object({
    swaps: z.array(peerswapSwapSchema).optional(),
});

const listPeersResponseSchema = z.object({
    peers: z.array(peerswapPeerSchema).optional(),
});

export const PEERSWAP_SUCCESS_STATES = ['State_ClaimedPreimage', 'State_ClaimedCoop', 'State_ClaimedCsv'];
export const PEERSWAP_FAILURE_STATES = ['State_SendCancel', 'State_SwapCanceled'];

export class PeerswapClient {
    private readonly logger = new Logger(PeerswapClient.name);

    constructor(private readonly restUrl: string) {}

    async swapOut(channelId: string, satAmount: number, asset: 'btc' | 'lbtc' = 'btc'): Promise<PeerswapSwap> {
        this.logger.log(`Initiating swap-out: channel=${channelId}, amount=${satAmount}, asset=${asset}`);
        const response = await fetch(`${this.restUrl}/v1/swaps/swapout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                channel_id: channelId,
                swap_amount: satAmount.toString(),
                asset,
                premium_limit_rate_ppm: '2000',
            }),
        });
        if (!response.ok) {
            const body = await response.text();
            throw new Error(`peerswap swapout failed (${response.status}): ${body}`);
        }
        const data = swapResponseSchema.parse(await response.json());
        return data.swap;
    }

    async getSwap(swapId: string): Promise<PeerswapSwap> {
        const response = await fetch(`${this.restUrl}/v1/swaps/${swapId}`);
        if (!response.ok) {
            const body = await response.text();
            throw new Error(`peerswap getswap failed (${response.status}): ${body}`);
        }
        const data = swapResponseSchema.parse(await response.json());
        return data.swap;
    }

    async listSwaps(): Promise<PeerswapSwap[]> {
        const response = await fetch(`${this.restUrl}/v1/swaps`);
        if (!response.ok) {
            const body = await response.text();
            throw new Error(`peerswap listswaps failed (${response.status}): ${body}`);
        }
        const data = listSwapsResponseSchema.parse(await response.json());
        return data.swaps ?? [];
    }

    async listPeers(): Promise<PeerswapPeer[]> {
        const response = await fetch(`${this.restUrl}/v1/peers`);
        if (!response.ok) {
            const body = await response.text();
            throw new Error(`peerswap listpeers failed (${response.status}): ${body}`);
        }
        const data = listPeersResponseSchema.parse(await response.json());
        return data.peers ?? [];
    }
}
