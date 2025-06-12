import { FortySwapClient } from './client.js';
import { getSwapInResponseSchema, getSwapOutResponseSchema, SwapInRequest, SwapOutRequest } from '../api.types.js';
import { ECPairInterface } from 'ecpair';
import { Network, networks } from 'bitcoinjs-lib';
import { SwapInTracker } from './swap-in.js';
import { z } from 'zod';
import { ECPair, SwapType } from '../utils.js';
import { SwapOutTracker } from './swap-out.js';

const persistedSwapInSchema = getSwapInResponseSchema.extend({
    type: z.literal('in'),
    refundKey: z.string(),
    refundRequestDate: z.string().pipe(z.coerce.date()).optional(),
});
export type PersistedSwapIn = z.infer<typeof persistedSwapInSchema>;

const persistedSwapOutSchema = getSwapOutResponseSchema.extend({
    type: z.literal('out'),
    preImage: z.string(),
    hash: z.string(),
    claimKey: z.string(),
    sweepAddress: z.string(),
    claimRequestDate: z.string().pipe(z.coerce.date()).optional(),
});
export type PersistedSwapOut = z.infer<typeof persistedSwapOutSchema>;

type SwapTypeToPersistedSwap<T extends SwapType> = T extends 'in' ? PersistedSwapIn : PersistedSwapOut;
export interface SwapPersistence {
    persist(swap: PersistedSwapIn | PersistedSwapOut): Promise<void>;

    update<T extends PersistedSwapIn | PersistedSwapOut>(swap: Partial<T> & Pick<PersistedSwapIn, 'swapId'> & { type: SwapType }): Promise<void>;

    findById<T extends SwapType>(type: T, swapId: PersistedSwapIn['swapId']): Promise<(T extends 'in' ? PersistedSwapIn : PersistedSwapOut) | null>;
}

export class InMemoryPersistence implements SwapPersistence {
    private data = {
        in: new Map<string, PersistedSwapIn>(),
        out: new Map<string, PersistedSwapOut>(),
    };

    async persist<T extends PersistedSwapIn | PersistedSwapOut>(swap: T): Promise<void> {
        const store = this.data[swap.type] as Map<string, T>;
        if (store.has(swap.swapId)) {
            throw new Error(`persisting swap that already exists: ${swap.swapId}`);
        }
        store.set(swap.swapId, swap);
    }
    async update<T extends PersistedSwapIn | PersistedSwapOut>(swap: Partial<T> & Pick<PersistedSwapIn, 'swapId'> & { type: SwapType }): Promise<void> {
        const store = this.data[swap.type] as Map<string, T>;
        const prev = store.get(swap.swapId);
        if (prev == null) {
            throw new Error(`updating swap that doesn't exist: ${swap.swapId}`);
        }
        const next = {
            ...prev,
            ...swap,
        };
        store.set(swap.swapId, next);
    }
    async findById<T extends SwapType>(type: T, swapId: PersistedSwapIn['swapId']): Promise<SwapTypeToPersistedSwap<T> | null> {
        return (this.data[type] as Map<string, SwapTypeToPersistedSwap<T>>).get(swapId) ?? null;
    }
}

interface SwapServiceOptions {
    baseUrl: string;
    persistence: SwapPersistence;
    network?: 'bitcoin' | 'regtest' | 'testnet' | Network;
}

export class SwapService {
    private client: FortySwapClient;
    private network: Network;

    constructor(private readonly opts: SwapServiceOptions) {
        this.client = new FortySwapClient(opts.baseUrl);
        this.network = (typeof opts.network === 'string' ? networks[opts.network] : opts.network) ?? networks.bitcoin;
    }

    async createSwapIn(
        swapRequest: Omit<SwapInRequest, 'refundPublicKey'> & {
            refundKey?: ECPairInterface;
            refundAddress: () => Promise<string>;
        },
    ): Promise<SwapInTracker> {
        const refundKey = swapRequest.refundKey ?? ECPair.makeRandom();
        const swap = await this.client.in.create({
            chain: swapRequest.chain,
            invoice: swapRequest.invoice,
            lockBlockDeltaIn: swapRequest.lockBlockDeltaIn,
            refundPublicKey: refundKey.publicKey.toString('hex'),
        });
        // TODO validate contract address
        const localSwap: PersistedSwapIn = {
            type: 'in',
            ...swap,
            refundKey: refundKey.privateKey!.toString('hex'),
        };
        await this.opts.persistence.persist(localSwap);
        return this.trackSwapIn({
            id: swap.swapId,
            refundAddress: swapRequest.refundAddress,
        });
    }

    trackSwapIn({ id, refundAddress }: { id: string; refundAddress: () => Promise<string> }): SwapInTracker {
        return new SwapInTracker(id, this.client.in, this.opts.persistence, refundAddress, this.network);
    }

    async createSwapOut(
        swapRequest: Omit<SwapOutRequest, 'claimPubKey' | 'preImageHash'> & {
            claimKey?: ECPairInterface;
            preImage?: Buffer;
            sweepAddress: string;
        },
    ): Promise<SwapOutTracker> {
        let preImage = swapRequest.preImage;
        if (preImage == null) {
            const randomBytes = crypto.getRandomValues(new Uint8Array(32));
            preImage = Buffer.from(randomBytes);
        }
        const preImageHash = await this.sha256(preImage);
        const claimKey = swapRequest.claimKey ?? ECPair.makeRandom();
        const swap = await this.client.out.create({
            chain: swapRequest.chain,
            inputAmount: swapRequest.inputAmount,
            preImageHash: preImageHash.toString('hex'),
            claimPubKey: claimKey.publicKey.toString('hex'),
        });
        // TODO validate contract address
        const localSwap: PersistedSwapOut = {
            type: 'out',
            ...swap,
            preImage: preImage.toString('hex'),
            hash: preImageHash.toString('hex'),
            claimKey: claimKey.privateKey!.toString('hex'),
            sweepAddress: swapRequest.sweepAddress,
        };
        await this.opts.persistence.persist(localSwap);
        return this.trackSwapOut({
            id: swap.swapId,
        });
    }

    trackSwapOut({ id }: { id: string }): SwapOutTracker {
        return new SwapOutTracker(id, this.client.out, this.opts.persistence, this.network);
    }

    private async sha256(message: Buffer): Promise<Buffer> {
        return Buffer.from(await crypto.subtle.digest('SHA-256', message));
    }
}
