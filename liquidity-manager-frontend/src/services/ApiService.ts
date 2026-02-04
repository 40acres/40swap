import { ChannelInfo, SwapRequest, SwapInitiateResponse, SwapHistory } from '../types/api';

const API_BASE = '/api';

export class ApiService {
    static async getChannels(): Promise<ChannelInfo[]> {
        const response = await fetch(`${API_BASE}/channels`);
        if (!response.ok) {
            throw new Error(`Failed to fetch channels: ${response.statusText}`);
        }
        return response.json();
    }

    static async getStrategies(): Promise<string[]> {
        const response = await fetch(`${API_BASE}/swap/strategies`);
        if (!response.ok) {
            throw new Error(`Failed to fetch strategies: ${response.statusText}`);
        }
        const data = await response.json();
        return data.strategies;
    }

    static async initiateSwap(request: SwapRequest): Promise<SwapInitiateResponse> {
        const response = await fetch(`${API_BASE}/swap`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(request),
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to initiate swap: ${error}`);
        }
        return response.json();
    }

    static async getSwapHistory(): Promise<SwapHistory[]> {
        const response = await fetch(`${API_BASE}/swap-history`);
        if (!response.ok) {
            throw new Error(`Failed to fetch swap history: ${response.statusText}`);
        }
        return response.json();
    }
}
