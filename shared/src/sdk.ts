import { FortySwapClient } from './client.js';
import { getSwapInResponseSchema, SwapInRequest } from './api.types.js';
import { ECPairFactory, ECPairInterface } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import { z } from 'zod';
import { Network, networks, Psbt, Transaction } from 'bitcoinjs-lib';
import { signContractSpend } from './bitcoin-utils.js';
import * as liquid from 'liquidjs-lib';
import { jsonEquals } from './utils.js';

const ECPair = ECPairFactory(ecc);

interface SwapInOptions {
    baseUrl: string;
    persistence: SwapInPersistence,
    network?: Network,
}

const persistedSwapInSchema = getSwapInResponseSchema.extend({
    type: z.literal('in'),
    refundKey: z.string(),
    refundRequestDate: z.string().pipe(z.coerce.date()).optional(),
});
export type PersistedSwapIn = z.infer<typeof persistedSwapInSchema>;

interface SwapInPersistence {
    persist(swap: PersistedSwapIn): void | Promise<void>;
    update(swap: Partial<PersistedSwapIn> & Pick<PersistedSwapIn, 'swapId'>): PersistedSwapIn | Promise<PersistedSwapIn>;
    load(swapId: string): PersistedSwapIn | null | Promise<PersistedSwapIn | null>;
}

export class InMemoryPersistence implements SwapInPersistence {
    private data = new Map<string, PersistedSwapIn>();

    load(swapId: string): PersistedSwapIn | null | Promise<PersistedSwapIn | null> {
        return this.data.get(swapId) ?? null;
    }

    persist(swap: PersistedSwapIn): void | Promise<void> {
        if (this.data.has(swap.swapId)) {
            throw new Error(`persisting swap that already exists: ${swap.swapId}`);
        }
        this.data.set(swap.swapId, swap);
    }

    update(swap: Partial<PersistedSwapIn> & Pick<PersistedSwapIn, 'swapId'>): PersistedSwapIn | Promise<PersistedSwapIn> {
        const prev = this.data.get(swap.swapId);
        if (prev == null) {
            throw new Error(`updating swap that doesn't exist: ${swap.swapId}`);
        }
        const next = {
            ...prev,
            ...swap,
        };
        this.data.set(swap.swapId, next);
        return next;
    }
}

type ChangeListener = (newStatus: PersistedSwapIn) => void;

export class SwapInTracker {
    private pollInterval: ReturnType<typeof setInterval> | undefined;
    private currentStatus: PersistedSwapIn | null = null;
    private changeListeners: ChangeListener[] = [];

    constructor(
        private id: string,
        private client: FortySwapClient['in'],
        private persistence: SwapInPersistence,
        private refundAddress: () => Promise<string>,
        private network: Network,
    ) {}

    start(): void {
        void this.refresh();
        this.pollInterval = setInterval(() => this.refresh(), 1500);
    }

    stop(): void {
        clearInterval(this.pollInterval);
    }

    get value(): PersistedSwapIn | null {
        return this.currentStatus;
    }

    on(ev: 'change', listener: ChangeListener): void {
        this.changeListeners.push(listener);
    }

    private async refresh(): Promise<void> {
        const swap = await this.client.find(this.id);
        const newStatus = await this.persistence.update(swap);
        if (!jsonEquals(this.currentStatus ?? {}, newStatus)) {
            this.changeListeners.forEach(listener => listener(newStatus));
        }
        this.currentStatus = newStatus;

        if (this.currentStatus.status === 'CONTRACT_EXPIRED' && this.currentStatus.refundRequestDate == null) {
            await this.refund();
        } else if (this.currentStatus.status === 'DONE') {
            clearInterval(this.pollInterval);
        }
    }

    private async refund(): Promise<void> {
        if (this.currentStatus == null) {
            throw new Error('invalid state');
        }
        const swap = this.currentStatus;
        const { network } = this;
        const address = await this.refundAddress();
        const psbtBase64 = await this.client.getRefundPsbt(this.currentStatus.swapId, address);
        const refundPrivateKey = Buffer.from(swap.refundKey, 'hex');
        let tx: Transaction | liquid.Transaction | null = null;
        if (this.currentStatus.chain === 'BITCOIN') {
            const psbt = Psbt.fromBase64(psbtBase64, { network });
            if (!this.isValidRefundTx(psbt, address)) {
                throw new Error('Error building refund transactions');
            }
            signContractSpend({
                psbt,
                network,
                key: ECPair.fromPrivateKey(refundPrivateKey),
                preImage: Buffer.alloc(0),
            });
            if (psbt.getFeeRate() > 1000) {
                throw new Error(`fee rate too high ${psbt.getFeeRate()}`);
            }
            tx = psbt.extractTransaction();
        } else if (swap.chain === 'LIQUID') {
            const pset = liquid.Pset.fromBase64(psbtBase64);
            if (!this.isValidLiquidRefundTx(pset, address)) {
                throw new Error('Error building refund transactions');
            }
            const inputIndex = 0;
            const input = pset.inputs[inputIndex];
            const sighashType = liquid.Transaction.SIGHASH_ALL;
            const signature = liquid.script.signature.encode(
                ECPair.fromPrivateKey(refundPrivateKey).sign(pset.getInputPreimage(inputIndex, sighashType)),
                sighashType,
            );
            const signer = new liquid.Signer(pset);
            signer.addSignature(
                inputIndex,
                {
                    partialSig: {
                        pubkey: ECPair.fromPrivateKey(refundPrivateKey).publicKey,
                        signature,
                    },
                },
                liquid.Pset.ECDSASigValidator(ecc),
            );
            const finalizer = new liquid.Finalizer(pset);
            const stack = [signature, Buffer.from(''), input.witnessScript!];
            finalizer.finalizeInput(inputIndex, () => {
                return {finalScriptWitness: liquid.witnessStackToScriptWitness(stack)};
            });
            tx = liquid.Extractor.extract(pset);
        }
        if (tx == null) {
            throw new Error('There was an error extracting the transaction');
        }
        await this.client.publishRefundTx(swap.swapId, tx.toHex());
    }

    private isValidRefundTx(psbt: Psbt, address: string): boolean {
        const outs = psbt.txOutputs;
        if (outs.length !== 1) {
            return false;
        }
        return outs[0].address === address;

    }

    private isValidLiquidRefundTx(pset: liquid.Pset, address: string): boolean {
        const outs = pset.outputs;
        // TODO verify that the non-fee output pays to the right address
        return outs.length === 2; // In liquid the fee output is also included
    }
}

export class SwapInService {
    private client: FortySwapClient['in'];

    constructor(private readonly opts: SwapInOptions) {
        this.client = new FortySwapClient(opts.baseUrl).in;
    }

    async create(swapRequest: Omit<SwapInRequest, 'refundPublicKey'> & {
        refundKey?: ECPairInterface,
        refundAddress: () => Promise<string>,
    }): Promise<SwapInTracker> {
        const refundKey = swapRequest.refundKey ?? ECPair.makeRandom();
        const swap = await this.client.create({
            chain: swapRequest.chain,
            invoice: swapRequest.invoice,
            lockBlockDeltaIn: swapRequest.lockBlockDeltaIn,
            refundPublicKey: refundKey.publicKey.toString('hex'),
        });

        const localSwap: PersistedSwapIn = {
            type: 'in',
            ...swap,
            refundKey: refundKey.privateKey!.toString('hex'),
        };
        await this.opts.persistence.persist(localSwap);
        return this.track({
            id: swap.swapId,
            refundAddress: swapRequest.refundAddress,
        });
    }

    track({ id, refundAddress} : {
        id: string,
        refundAddress: () => Promise<string>,
    }): SwapInTracker {
        return new SwapInTracker(
            id,
            this.client,
            this.opts.persistence,
            refundAddress,
            this.opts.network ?? networks.bitcoin,
        );
    }
}