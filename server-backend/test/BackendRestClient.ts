import { StartedGenericContainer } from 'testcontainers/build/generic-container/started-generic-container.js';
import { 
    GetSwapInResponse, 
    getSwapInResponseSchema, 
    SwapInRequest, 
    GetSwapOutResponse, 
    getSwapOutResponseSchema, 
    SwapOutRequest, 
    PsbtResponse, 
    psbtResponseSchema,
} from '../../shared/src/api.types';

export class BackendRestClient {
    private baseUrl: string;

    constructor(
        container: StartedGenericContainer
    ) {
        this.baseUrl = `http://${container.getHost()}:${container.getMappedPort(8081)}`;
    }

    async createSwapIn(s: SwapInRequest): Promise<GetSwapInResponse> {
        const resp = await fetch(`${this.baseUrl}/api/swap/in`, {
            method: 'POST',
            body: JSON.stringify(s),
            headers: {
                'content-type': 'application/json',
            },
        });
        if (resp.status >= 300) {
            throw new Error(`error creating swap-in. ${await resp.text()}`);
        }
        return getSwapInResponseSchema.parse(await resp.json());
    }

    async getSwapIn(id: string): Promise<GetSwapInResponse> {
        const resp = await fetch(`${this.baseUrl}/api/swap/in/${id}`);
        if (resp.status >= 300) {
            throw new Error(`error retrieving swap. ${await resp.text()}`);
        }
        return getSwapInResponseSchema.parse(await resp.json());
    }

    async createSwapOut(request: SwapOutRequest): Promise<GetSwapOutResponse> {
        const resp = await fetch(`${this.baseUrl}/api/swap/out`, {
            method: 'POST',
            body: JSON.stringify(request),
            headers: {
                'content-type': 'application/json',
            },
        });
        if (resp.status >= 300) {
            throw new Error(`error creating swap-out. ${await resp.text()}`);
        }
        return getSwapOutResponseSchema.parse(await resp.json());
    }

    async getSwapOut(id: string): Promise<GetSwapOutResponse> {
        const resp = await fetch(`${this.baseUrl}/api/swap/out/${id}`);
        if (resp.status >= 300) {
            throw new Error(`error retrieving swap. ${await resp.text()}`);
        }
        return getSwapOutResponseSchema.parse(await resp.json());
    }

    async getClaimPsbt(id: string, address: string): Promise<PsbtResponse> {
        const resp = await fetch(`${this.baseUrl}/api/swap/out/${id}/claim-psbt?address=${address}`);
        if (resp.status >= 300) {
            throw new Error(`error getting claim psbt. ${await resp.text()}`);
        }
        const json = await resp.json();
        console.log('json', json);
        return psbtResponseSchema.parse(json);
    }

    async claimSwap(id: string, tx: string): Promise<void> {
        const resp = await fetch(`${this.baseUrl}/api/swap/out/${id}/claim`, {
            method: 'POST',
            body: JSON.stringify({ tx }),
            headers: {
                'accept': '*/*',
                'content-type': 'application/json',
            },
        });
        console.log('resp', resp);
        if (resp.status >= 300) {
            throw new Error(`error claiming swap. ${await resp.text()}`);
        }
    }
}