import { Psbt, Transaction } from 'bitcoinjs-lib';
import {
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

export class SwapInService {

    constructor(
        private config: Promise<FrontendConfiguration>,
        private localSwapStorageService: LocalSwapStorageService,
        private ECPair: ECPairAPI,
    ) {}

    async getRefund(swap: GetSwapInResponse, address: string): Promise<void> {
        const network = (await this.config).bitcoinNetwork;
        const refundPrivateKeyHex = (await this.localSwapStorageService.findById('in', swap.swapId))?.refundKey;
        if (refundPrivateKeyHex == null) {
            throw new Error();
        }
        const refundPrivateKey = Buffer.from(refundPrivateKeyHex, 'hex');
        if (swap.status !== 'CONTRACT_EXPIRED') {
            throw new Error(`invalid state ${swap.status}`);
        }
        const psbt = await this.getRefundPsbt(swap.swapId, address);
        // TODO verify outputs
        signContractSpend({
            psbt,
            network,
            key: this.ECPair.fromPrivateKey(refundPrivateKey),
            preImage: Buffer.alloc(0),
        });
        const tx = psbt.extractTransaction();
        await this.publishRefundTx(swap.swapId, tx);
    }

    async getSwap(id: string): Promise<GetSwapInResponse> {
        const resp = await fetch(`/api/swap/in/${id}`);
        if (resp.status >= 300) {
            throw new Error(`Unknown error retrieving swap. ${await resp.text()}`);
        }
        return getSwapInResponseSchema.parse(await resp.json());
    }

    async createSwap(invoice: string): Promise<PersistedSwapIn> {
        const refundKey = applicationContext.ECPair.makeRandom();
        const swap = await this.postSwap(invoice, refundKey.publicKey);
        const localSwap: PersistedSwapIn = {
            type: 'in',
            ...swap,
            refundKey: refundKey.privateKey!.toString('hex'),
        };
        await applicationContext.localSwapStorageService.persist(localSwap);
        return localSwap;
    }

    private async getRefundPsbt(swapId: string, address: string): Promise<Psbt> {
        const network = (await this.config).bitcoinNetwork;
        const resp = await fetch(`/api/swap/in/${swapId}/refund-psbt?` + new URLSearchParams({
            address,
        }));
        if (resp.status >= 300) {
            throw new Error(`Unknown error getting refund psbt. ${await resp.text()}`);
        }
        const psbt = Psbt.fromBase64(psbtResponseSchema.parse(await resp.json()).psbt, { network });
        return psbt;
    }

    private async publishRefundTx(swapId: string, tx: Transaction): Promise<void> {
        const resp = await fetch(`/api/swap/in/${swapId}/refund-tx`, {
            method: 'POST',
            body: JSON.stringify({
                tx: tx.toHex(),
            } satisfies TxRequest),
            headers: {
                'content-type': 'application/json',
            },
        });
        if (resp.status >= 300) {
            throw new Error(`Unknown error broadcasting refund tx. ${JSON.stringify(await resp.text())}`);
        }
    }

    private async postSwap(invoice: string, refundPublicKey: Buffer): Promise<GetSwapInResponse> {
        const resp = await fetch('/api/swap/in', {
            method: 'POST',
            body: JSON.stringify({
                invoice,
                refundPublicKey: refundPublicKey.toString('hex'),
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