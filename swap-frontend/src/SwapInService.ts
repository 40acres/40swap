import { Psbt } from 'bitcoinjs-lib';
import {
    Chain,
    FrontendConfiguration,
    GetSwapInResponse,
    getSwapInResponseSchema,
    psbtResponseSchema,
    signContractSpend,
    SwapInRequest,
    TxRequest,
} from '@40swap/shared';
import { LocalSwapStorageService, PersistedSwapIn } from './LocalSwapStorageService.js';
import { ECPairAPI } from 'ecpair';
import { applicationContext } from './ApplicationContext.js';
import * as liquid from 'liquidjs-lib';
import * as ecc from 'tiny-secp256k1';

export class SwapInService {

    constructor(
        private config: Promise<FrontendConfiguration>,
        private localSwapStorageService: LocalSwapStorageService,
        private ECPair: ECPairAPI,
    ) {}

    async getRefund(swap: PersistedSwapIn, address: string): Promise<void> {
        const network = (await this.config).bitcoinNetwork;
        const refundPrivateKeyHex = (await this.localSwapStorageService.findById('in', swap.swapId))?.refundKey;
        if (refundPrivateKeyHex == null) {
            throw new Error();
        }
        const refundPrivateKey = Buffer.from(refundPrivateKeyHex, 'hex');
        if (swap.status !== 'CONTRACT_EXPIRED') {
            throw new Error(`invalid state ${swap.status}`);
        }
        let tx: string | null = null;
        const psbtHex = await this.getRefundPsbtHex(swap.swapId, address);
        if (swap.chain === 'BITCOIN') {
            const psbt = Psbt.fromBase64(psbtHex, { network });
            if (!this.isValidRefundTx(psbt, address)) {
                throw new Error('Error building refund transactions');
            }
            signContractSpend({
                psbt,
                network,
                key: this.ECPair.fromPrivateKey(refundPrivateKey),
                preImage: Buffer.alloc(0),
            });
            if (psbt.getFeeRate() > 1000) {
                throw new Error(`fee rate too high ${psbt.getFeeRate()}`);
            }
            tx = psbt.extractTransaction().toHex();
        } else if (swap.chain === 'LIQUID') {
            const pset = liquid.Pset.fromBase64(psbtHex);
            if (!this.isValidLiquidRefundTx(pset, address)) {
                throw new Error('Error building refund transactions');
            }
            const inputIndex = 0;
            const input = pset.inputs[inputIndex];
            const sighashType = liquid.Transaction.SIGHASH_ALL;
            const signature = liquid.script.signature.encode(
                this.ECPair.fromPrivateKey(refundPrivateKey).sign(pset.getInputPreimage(inputIndex, sighashType)),
                sighashType,
            );
            const signer = new liquid.Signer(pset);
            signer.addSignature(
                inputIndex,
                {
                    partialSig: {
                        pubkey: this.ECPair.fromPrivateKey(refundPrivateKey).publicKey,
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
            // TODO: Refactor this
            // tx = liquid.Extractor.extract(pset);
            tx = pset.toBase64();
        }
        if (tx == null) {
            throw new Error('There was an error extracting the transaction');
        }
        await this.publishRefundTx(swap.swapId, tx);
    }

    isValidRefundTx(psbt: Psbt, address: string): boolean {
        const outs = psbt.txOutputs;
        if (outs.length !== 1) {
            return false;
        }
        if (outs[0].address !== address) {
            return false;
        }
        return true;
    }

    isValidLiquidRefundTx(pset: liquid.Pset, address: string): boolean {
        const outs = pset.outputs;
        if (outs.length !== 2) { // In liquid the fee output is also included
            return false;
        }
        return true;
    }

    async getSwap(id: string): Promise<PersistedSwapIn> {
        const resp = await fetch(`/api/swap/in/${id}`);
        if (resp.status >= 300) {
            throw new Error(`Unknown error retrieving swap. ${await resp.text()}`);
        }
        const remoteSwap = getSwapInResponseSchema.parse(await resp.json());
        const localswap = await this.localSwapStorageService.findById('in', id);
        if (localswap == null) {
            throw new Error('swap does not exist in local DB');
        }
        return {
            ...localswap,
            ...remoteSwap,
        };
    }

    async createSwap(invoice: string, chain: Chain): Promise<PersistedSwapIn> {
        const refundKey = applicationContext.ECPair.makeRandom();
        const swap = await this.postSwap(invoice, refundKey.publicKey, chain);
        const localSwap: PersistedSwapIn = {
            type: 'in',
            ...swap,
            refundKey: refundKey.privateKey!.toString('hex'),
        };
        await applicationContext.localSwapStorageService.persist(localSwap);
        return localSwap;
    }

    private async getRefundPsbtHex(swapId: string, address: string): Promise<string> {
        const resp = await fetch(`/api/swap/in/${swapId}/refund-psbt?` + new URLSearchParams({
            address,
        }));
        if (resp.status >= 300) {
            throw new Error(`Unknown error getting refund psbt. ${await resp.text()}`);
        }
        return psbtResponseSchema.parse(await resp.json()).psbt;
    }

    private async publishRefundTx(swapId: string, tx: string): Promise<void> {
        const resp = await fetch(`/api/swap/in/${swapId}/refund-tx`, {
            method: 'POST',
            body: JSON.stringify({
                tx,
            } satisfies TxRequest),
            headers: {
                'content-type': 'application/json',
            },
        });
        if (resp.status >= 300) {
            throw new Error(`Unknown error broadcasting refund tx. ${JSON.stringify(await resp.text())}`);
        }
    }

    private async postSwap(invoice: string, refundPublicKey: Buffer, chain: Chain): Promise<GetSwapInResponse> {
        const resp = await fetch('/api/swap/in', {
            method: 'POST',
            body: JSON.stringify({
                invoice,
                refundPublicKey: refundPublicKey.toString('hex'),
                chain,
            } satisfies SwapInRequest),
            headers: {
                'content-type': 'application/json',
            },
        });
        if (resp.status >= 300) {
            throw new Error(`Unknown error creating swap-in. ${await resp.text()}`);
        }
        return getSwapInResponseSchema.parse(await resp.json());
    }
}