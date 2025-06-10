import { Psbt, Transaction } from 'bitcoinjs-lib';
import { Chain, FortySwapClient, FrontendConfiguration, signContractSpend } from '@40swap/shared';
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
        private client: FortySwapClient,
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
        let tx: Transaction | liquid.Transaction | null = null;
        const psbtBase64 = await this.client.in.getRefundPsbt(swap.swapId, address);
        if (swap.chain === 'BITCOIN') {
            const psbt = Psbt.fromBase64(psbtBase64, { network });
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
                return { finalScriptWitness: liquid.witnessStackToScriptWitness(stack) };
            });
            tx = liquid.Extractor.extract(pset);
        }
        if (tx == null) {
            throw new Error('There was an error extracting the transaction');
        }
        await this.client.in.publishRefundTx(swap.swapId, tx.toHex());
    }

    isValidRefundTx(psbt: Psbt, address: string): boolean {
        const outs = psbt.txOutputs;
        if (outs.length !== 1) {
            return false;
        }
        return outs[0].address === address;
    }

    isValidLiquidRefundTx(pset: liquid.Pset, address: string): boolean {
        const outs = pset.outputs;
        // TODO verify that the non-fee output pays to the right address
        return outs.length === 2; // In liquid the fee output is also included
    }

    async getSwap(id: string): Promise<PersistedSwapIn> {
        const remoteSwap = await this.client.in.find(id);
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
        const swap = await this.client.in.create({
            chain,
            invoice,
            refundPublicKey: refundKey.publicKey.toString('hex'),
        });
        const localSwap: PersistedSwapIn = {
            type: 'in',
            ...swap,
            refundKey: refundKey.privateKey!.toString('hex'),
        };
        await applicationContext.localSwapStorageService.persist(localSwap);
        return localSwap;
    }
}
