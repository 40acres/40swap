import { StartedGenericContainer } from 'testcontainers/build/generic-container/started-generic-container.js';
import { GetSwapInResponse, getSwapInResponseSchema, SwapInRequest } from '../../shared/src/api.types';

export class BackendRestClient {
    private baseUrl: string;

    constructor(container: StartedGenericContainer) {
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
        const resp = await fetch(`${this.baseUrl}/api/swap/in/${id}`, {
            method: 'GET',
            headers: {
                'content-type': 'application/json',
            },
        });
        if (resp.status >= 300) {
            throw new Error(`error retrieving swap. ${await resp.text()}`);
        }
        const json = await resp.json();
        console.log(json);
        return getSwapInResponseSchema.parse(json);
    }
}