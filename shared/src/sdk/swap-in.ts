import { FortySwapClient } from './client.js';
import * as ecc from 'tiny-secp256k1';
import { Network, Psbt, Transaction } from 'bitcoinjs-lib';
import { signContractSpend } from '../bitcoin-utils.js';
import * as liquid from 'liquidjs-lib';
import { ECPair, jsonEquals } from '../utils.js';
import { PersistedSwapIn, SwapPersistence } from './service.js';

type ChangeListener = (newStatus: PersistedSwapIn) => void;
type ErrorListener = (errorType: 'REFUND', error: Error) => void;

export class SwapInTracker {
    private pollInterval: ReturnType<typeof setInterval> | undefined;
    private currentStatus: PersistedSwapIn | null = null;
    private listeners: { change: ChangeListener[], error: ErrorListener[] } = {
        change: [],
        error: [],
    };
    private refreshing = false;

    constructor(
        public id: string,
        private client: FortySwapClient['in'],
        private persistence: SwapPersistence,
        private refundAddress: () => Promise<string>,
        private network: Network,
    ) {}

    start(): void {
        void this.safeRefresh();
        this.pollInterval = setInterval(() => this.safeRefresh(), 1500);
    }

    stop(): void {
        clearInterval(this.pollInterval);
    }

    get value(): PersistedSwapIn | null {
        return this.currentStatus;
    }

    on<T extends keyof SwapInTracker['listeners']>(ev: T, listener: SwapInTracker['listeners'][T][number]): void {
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
        await this.persistence.update({ type: 'in', ...swap });
        const newStatus = await this.persistence.findById('in', this.id);
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

        if (this.currentStatus.status === 'CONTRACT_EXPIRED' && this.currentStatus.refundRequestDate == null) {
            try {
                await this.refund();
                await this.persistence.update({ type: 'in', swapId: swap.swapId, refundRequestDate: new Date() });
            } catch (error) {
                this.listeners.error.forEach(listener => {
                    try {
                        listener('REFUND', error as Error);
                    } catch (e) {
                        // deliberately empty
                    }
                });
            }
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
