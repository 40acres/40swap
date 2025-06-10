import { Psbt } from 'bitcoinjs-lib';
import { Chain, FortySwapClient, FrontendConfiguration, GetSwapOutResponse, signContractSpend, signLiquidPset } from '@40swap/shared';
import { LocalSwapStorageService, PersistedSwapOut } from './LocalSwapStorageService.js';
import { ECPairAPI } from 'ecpair';
import Decimal from 'decimal.js';
import * as liquid from 'liquidjs-lib';

export class SwapOutService {
    constructor(
        private config: Promise<FrontendConfiguration>,
        private localSwapStorageService: LocalSwapStorageService,
        private ECPair: ECPairAPI,
        private client: FortySwapClient,
    ) {}

    async claim(swap: GetSwapOutResponse): Promise<void> {
        if (swap.lockTx == null) {
            throw new Error();
        }
        const localDetails = await this.localSwapStorageService.findById('out', swap.swapId);
        if (localDetails == null) {
            throw new Error();
        }
        const { claimKey, preImage, sweepAddress } = localDetails;
        const network = (await this.config).bitcoinNetwork;
        const psbtBase64 = (await this.client.out.getClaimPsbt(swap.swapId, sweepAddress)).psbt;
        if (swap.chain === 'BITCOIN') {
            const psbt = Psbt.fromBase64(psbtBase64, { network });
            if (!this.isValidClaimTx(psbt, sweepAddress)) {
                throw new Error('Error building refund transactions');
            }
            signContractSpend({
                psbt,
                network,
                key: this.ECPair.fromPrivateKey(Buffer.from(claimKey, 'hex')),
                preImage: Buffer.from(preImage, 'hex'),
            });
            if (psbt.getFeeRate() > 1000) {
                throw new Error(`fee rate too high ${psbt.getFeeRate()}`);
            }
            const claimTx = psbt.extractTransaction();
            await this.client.out.publishClaimTx(swap.swapId, claimTx.toHex());
        } else if (swap.chain === 'LIQUID') {
            const pset = liquid.Pset.fromBase64(psbtBase64);
            if (!this.isValidLiquidClaimTx(pset, sweepAddress)) {
                throw new Error('Error building refund transactions');
            }
            signLiquidPset(pset, preImage, this.ECPair.fromPrivateKey(Buffer.from(claimKey, 'hex')));
            const claimTx = liquid.Extractor.extract(pset);
            await this.client.out.publishClaimTx(swap.swapId, claimTx.toHex());
        }
    }

    isValidClaimTx(psbt: Psbt, address: string): boolean {
        const outs = psbt.txOutputs;
        if (outs.length !== 1) {
            return false;
        }
        return outs[0].address === address;
    }

    isValidLiquidClaimTx(pset: liquid.Pset, address: string): boolean {
        const outs = pset.outputs;
        // TODO verify that the non-fee output pays to the right address
        return outs.length === 2; // In liquid the fee output is also included
    }

    async getSwap(id: string): Promise<PersistedSwapOut> {
        const remoteSwap = await this.client.out.find(id);
        const localswap = await this.localSwapStorageService.findById('out', id);
        if (localswap == null) {
            throw new Error('swap does not exist in local DB');
        }
        return {
            ...localswap,
            ...remoteSwap,
        };
    }

    async createSwap(sweepAddress: string, amount: number, chain: Chain): Promise<PersistedSwapOut> {
        const randomBytes = crypto.getRandomValues(new Uint8Array(32));
        const preImage = Buffer.from(randomBytes);
        const preImageHash = await this.sha256(preImage);
        const claimKey = this.ECPair.makeRandom();
        const localSwapDetails = {
            preImage: preImage.toString('hex'),
            hash: preImageHash.toString('hex'),
            claimKey: claimKey.privateKey!.toString('hex'),
            sweepAddress,
        };
        const swap = await this.client.out.create({
            inputAmount: new Decimal(amount).toDecimalPlaces(8).toNumber(),
            claimPubKey: claimKey.publicKey.toString('hex'),
            preImageHash: preImageHash.toString('hex'),
            chain,
        });
        const localSwap: PersistedSwapOut = {
            type: 'out',
            ...swap,
            ...localSwapDetails,
        };
        await this.localSwapStorageService.persist(localSwap);
        return localSwap;
    }

    private async sha256(message: Buffer): Promise<Buffer> {
        return Buffer.from(await crypto.subtle.digest('SHA-256', message));
    }
}
