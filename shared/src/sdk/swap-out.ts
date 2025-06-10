import { PersistedSwapOut, SwapPersistence } from './service.js';
import { FortySwapClient } from './client.js';
import { Network, Psbt } from 'bitcoinjs-lib';
import { ECPair, jsonEquals } from '../utils.js';
import { signContractSpend } from '../bitcoin-utils.js';
import * as liquid from 'liquidjs-lib';
import { signLiquidPset } from '../liquid-utils.js';

type ChangeListener = (newStatus: PersistedSwapOut) => void;
type ErrorListener = (errorType: 'CLAIM', error: Error) => void;

export class SwapOutTracker {
    private pollInterval: ReturnType<typeof setInterval> | undefined;
    private currentStatus: PersistedSwapOut | null = null;
    private listeners: { change: ChangeListener[], error: ErrorListener[] } = {
        change: [],
        error: [],
    };
    private refreshing = false;

    constructor(
        public id: string,
        private client: FortySwapClient['out'],
        private persistence: SwapPersistence,
        private network: Network,
    ) {}

    start(): void {
        void this.safeRefresh();
        this.pollInterval = setInterval(async () => this.safeRefresh(), 1500);
    }

    stop(): void {
        clearInterval(this.pollInterval);
    }

    get value(): PersistedSwapOut | null {
        return this.currentStatus;
    }

    on<T extends keyof SwapOutTracker['listeners']>(ev: T, listener: SwapOutTracker['listeners'][T][number]): void {
        const arr = this.listeners[ev] as Array<typeof listener>;
        arr.push(listener);
    }

    private async safeRefresh(): Promise<void> {
        if (this.refreshing) {
            return;
        }
        try {
            this.refreshing = true;
            await this.refresh();
        } finally {
            this.refreshing = false;
        }
    }

    private async refresh(): Promise<void> {
        const swap = await this.client.find(this.id);
        await this.persistence.update({ type: 'out', ...swap });
        const newStatus = await this.persistence.findById('out', this.id);
        if (newStatus ==  null) {
            throw new Error('could not find a swap that was just persisted');
        }
        if (!jsonEquals(this.currentStatus ?? {}, newStatus)) {
            this.listeners.change.forEach(listener => {
                try {
                    listener(newStatus);
                } catch (e) {
                    // deliberately empty
                }
            });
        }
        this.currentStatus = newStatus;

        if (this.currentStatus.status === 'CONTRACT_FUNDED' && this.currentStatus.claimRequestDate == null) {
            try {
                await this.claim();
                await this.persistence.update({ type: 'out', swapId: swap.swapId, claimRequestDate: new Date() });
            } catch (error) {
                this.listeners.error.forEach(listener => {
                    try {
                        listener('CLAIM', error as Error);
                    } catch (e) {
                        // deliberately empty
                    }
                });
            }
        } else if (this.currentStatus.status === 'DONE') {
            clearInterval(this.pollInterval);
        }
    }

    private async claim(): Promise<void> {
        if (this.currentStatus == null) {
            throw new Error('invalid state');
        }
        const swap = this.currentStatus;
        if (swap.lockTx == null) {
            throw new Error();
        }
        const { claimKey, preImage, sweepAddress } = swap;
        const { network } = this;
        const psbtBase64 = (await this.client.getClaimPsbt(swap.swapId, sweepAddress)).psbt;
        if (swap.chain === 'BITCOIN') {
            const psbt = Psbt.fromBase64(psbtBase64, { network });
            if (!this.isValidClaimTx(psbt, sweepAddress)) {
                throw new Error('Error building refund transactions');
            }
            signContractSpend({
                psbt,
                network,
                key: ECPair.fromPrivateKey(Buffer.from(claimKey, 'hex')),
                preImage: Buffer.from(preImage, 'hex'),
            });
            if (psbt.getFeeRate() > 1000) {
                throw new Error(`fee rate too high ${psbt.getFeeRate()}`);
            }
            const claimTx = psbt.extractTransaction();
            await this.client.publishClaimTx(swap.swapId, claimTx.toHex());
        } else if (swap.chain === 'LIQUID') {
            const pset = liquid.Pset.fromBase64(psbtBase64);
            if (!this.isValidLiquidClaimTx(pset, sweepAddress)) {
                throw new Error('Error building refund transactions');
            }
            signLiquidPset(pset, preImage, ECPair.fromPrivateKey(Buffer.from(claimKey, 'hex')));
            const claimTx = liquid.Extractor.extract(pset);
            await this.client.publishClaimTx(swap.swapId, claimTx.toHex());
        }
    }

    private isValidClaimTx(psbt: Psbt, address: string): boolean {
        const outs = psbt.txOutputs;
        if (outs.length !== 1) {
            return false;
        }
        return outs[0].address === address;

    }

    private isValidLiquidClaimTx(pset: liquid.Pset, address: string): boolean {
        const outs = pset.outputs;
        // TODO verify that the non-fee output pays to the right address
        return outs.length === 2; // In liquid the fee output is also included
    }
}
