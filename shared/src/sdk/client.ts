import {
    GetSwapInResponse,
    getSwapInResponseSchema, GetSwapOutResponse, getSwapOutResponseSchema, PsbtResponse,
    psbtResponseSchema,
    SwapInRequest, SwapOutRequest,
    TxRequest,
} from '../api.types.js';

export class FortySwapClient {
    constructor(private readonly baseUrl: string) {}

    public readonly in = {
        create: async (request: SwapInRequest): Promise<GetSwapInResponse> => {
            const resp = await fetch(`${this.baseUrl}/api/swap/in`, {
                method: 'POST',
                body: JSON.stringify(request),
                headers: {
                    'content-type': 'application/json',
                },
            });
            if (resp.status >= 300) {
                throw new Error(`Unknown error creating swap-in. ${await resp.text()}`);
            }
            return getSwapInResponseSchema.parse(await resp.json());
        },
        find: async (swapId: string): Promise<GetSwapInResponse> => {
            const resp = await fetch(`${this.baseUrl}/api/swap/in/${swapId}`);
            if (resp.status >= 300) {
                throw new Error(`Unknown error retrieving swap-in with id ${swapId}. ${await resp.text()}`);
            }
            return getSwapInResponseSchema.parse(await resp.json());
        },
        getRefundPsbt: async (swapId: string, address: string): Promise<string> => {
            const resp = await fetch(`${this.baseUrl}/api/swap/in/${swapId}/refund-psbt?` + new URLSearchParams({
                address,
            }));
            if (resp.status >= 300) {
                throw new Error(`Unknown error getting refund psbt for swap-in with id ${swapId}. ${await resp.text()}`);
            }
            return psbtResponseSchema.parse(await resp.json()).psbt;
        },
        publishRefundTx: async (swapId: string, txHex: string): Promise<void> => {
            const resp = await fetch(`${this.baseUrl}/api/swap/in/${swapId}/refund-tx`, {
                method: 'POST',
                body: JSON.stringify({
                    tx: txHex,
                } satisfies TxRequest),
                headers: {
                    'content-type': 'application/json',
                },
            });
            if (resp.status >= 300) {
                throw new Error(`Unknown error broadcasting refund tx for swap-in with id ${swapId}. ${JSON.stringify(await resp.text())}`);
            }
        },
    };

    public readonly out = {
        create: async (request: SwapOutRequest): Promise<GetSwapOutResponse> => {
            const resp = await fetch(`${this.baseUrl}/api/swap/out`, {
                method: 'POST',
                body: JSON.stringify(request),
                headers: {
                    'content-type': 'application/json',
                },
            });
            if (resp.status >= 300) {
                throw new Error(`Unknown error creating swap-out. ${await resp.text()}`);
            }
            return getSwapOutResponseSchema.parse(await resp.json());
        },
        find: async (swapId: string): Promise<GetSwapOutResponse> => {
            const resp = await fetch(`${this.baseUrl}/api/swap/out/${swapId}`);
            if (resp.status >= 300) {
                throw new Error(`Unknown error retrieving swap-out with id ${swapId}. ${await resp.text()}`);
            }
            return getSwapOutResponseSchema.parse(await resp.json());
        },
        getClaimPsbt: async (swapId: string, address: string): Promise<PsbtResponse> => {
            const resp = await fetch(`${this.baseUrl}/api/swap/out/${swapId}/claim-psbt?` + new URLSearchParams({
                address,
            }));
            if (resp.status >= 300) {
                throw new Error(`Unknown error getting claim psbt for swap-out with id ${swapId}. ${await resp.text()}`);
            }
            return psbtResponseSchema.parse(await resp.json());
        },
        publishClaimTx: async(swapId: string, txHex: string): Promise<void> => {
            const resp = await fetch(`${this.baseUrl}/api/swap/out/${swapId}/claim`, {
                method: 'POST',
                body: JSON.stringify({ tx: txHex }),
                headers: {
                    'content-type': 'application/json',
                },
            });
            if (resp.status >= 300) {
                throw new Error(`Unknown error broadcasting claim tx for swap-out with id ${swapId}. ${JSON.stringify(await resp.text())}`);
            }
        },
    };
}
