import { Psbt, Transaction } from 'bitcoinjs-lib';
import {
    FrontendConfiguration,
    GetSwapOutResponse,
    getSwapOutResponseSchema,
    psbtResponseSchema,
    signContractSpend,
    SwapOutRequest,
    TxRequest,
} from '@40swap/shared';
import { LocalSwapStorageService, PersistedSwapOut } from './LocalSwapStorageService.js';
import { ECPairAPI } from 'ecpair';
import Decimal from 'decimal.js';

export class SwapOutService {

    constructor(
        private config: Promise<FrontendConfiguration>,
        private localSwapStorageService: LocalSwapStorageService,
        private ECPair: ECPairAPI,
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
        const psbt = await this.getClaimPsbt(swap.swapId, sweepAddress);
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
        await this.publishClaimTx(swap.swapId, claimTx);
    }

    isValidClaimTx(psbt: Psbt, address: string): boolean {
        const outs = psbt.txOutputs;
        if (outs.length !== 1) {
            return false;
        }
        if (outs[0].address !== address) {
            return false;
        }
        return true;
    }

    async getSwap(id: string): Promise<PersistedSwapOut> {
        const resp = await fetch(`/api/swap/out/${id}`);
        if (resp.status >= 300) {
            throw new Error(`Unknown error retrieving swap. ${JSON.stringify(await resp.text())}`);
        }
        const remoteSwap = getSwapOutResponseSchema.parse(await resp.json());
        const localswap = await this.localSwapStorageService.findById('out', id);
        if (localswap == null) {
            throw new Error('swap does not exist in local DB');
        }
        return {
            ...localswap,
            ...remoteSwap,
        };
    }

    async createSwap(sweepAddress: string, amount: number): Promise<PersistedSwapOut> {
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
        const swap = await this.postSwap(amount, claimKey.publicKey, preImageHash);
        const localSwap: PersistedSwapOut = {
            type: 'out',
            ...swap,
            ...localSwapDetails,
        };
        await this.localSwapStorageService.persist(localSwap);
        return localSwap;
    }

    private async getClaimPsbt(swapId: string, address: string): Promise<Psbt> {
        const network = (await this.config).bitcoinNetwork;
        const resp = await fetch(`/api/swap/out/${swapId}/claim-psbt?` + new URLSearchParams({
            address,
        }));
        if (resp.status >= 300) {
            throw new Error(`error getting claim psbt: ${await resp.text()}`);
        }
        const psbt = Psbt.fromBase64(psbtResponseSchema.parse(await resp.json()).psbt, { network });
        return psbt;
    }

    private async publishClaimTx(swapId: string, tx: Transaction): Promise<void> {
        const resp = await fetch(`/api/swap/out/${swapId}/claim`, {
            method: 'POST',
            body: JSON.stringify({
                tx: tx.toHex(),
            } satisfies TxRequest),
            headers: {
                'content-type': 'application/json',
            },
        });
        if (resp.status >= 300) {
            throw new Error(`error claiming: ${await resp.text()}`);
        }
    }

    private async postSwap(amount: number, claimPubKey: Buffer, preImageHash: Buffer): Promise<GetSwapOutResponse> {
        const resp = await fetch('/api/swap/out', {
            method: 'POST',
            body: JSON.stringify({
                inputAmount: new Decimal(amount).toDecimalPlaces(8).toNumber(),
                claimPubKey: claimPubKey.toString('hex'),
                preImageHash: preImageHash.toString('hex'),
                chain: 'BITCOIN',
            } satisfies SwapOutRequest),
            headers: {
                'content-type': 'application/json',
            },
        });
        if (resp.status >= 300) {
            throw new Error(`Unknown error creating the swap. ${await resp.text()}`);
        }
        return getSwapOutResponseSchema.parse(await resp.json());
    }

    private async sha256(message: Buffer): Promise<Buffer> {
        return Buffer.from(await crypto.subtle.digest('SHA-256', message));
    }
}