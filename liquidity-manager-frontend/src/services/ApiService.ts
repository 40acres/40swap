import { ChannelInfo, SwapRequest, SwapResult } from '../types/api';

const API_BASE = '/api';

export class ApiService {
    static async getChannels(): Promise<ChannelInfo[]> {
        const response = await fetch(`${API_BASE}/channels`);
        if (!response.ok) {
            throw new Error(`Failed to fetch channels: ${response.statusText}`);
        }
        return response.json();
    }

    static async executeSwap(request: SwapRequest): Promise<SwapResult> {
        const response = await fetch(`${API_BASE}/swap`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(request),
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to execute swap: ${error}`);
        }
        return response.json();
    }
}
