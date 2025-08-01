import { SwapProvider } from './SwapProvider.js';
import * as crypto from 'crypto';

export class BitfinexProvider extends SwapProvider {
    private baseUrl = 'https://api.bitfinex.com';

    constructor(key: string, secret: string) {
        super('Bitfinex', key, secret);
    }

    async send(amount: number, destination?: string): Promise<void> {
        console.log(`🚀 Sending ${amount} BTC to Lightning wallet on ${this.name}`);
    }

    async withdraw(amount: number, address: string): Promise<void> {
        console.log(`💰 Withdrawing ${amount} L-BTC to address: ${address}`);
    }

    async swap(amount: number, liquidAddress: string): Promise<void> {
        console.log(`🔄 Starting complete swap: ${amount} BTC → Lightning → Liquid`);
    }

    // Métodos privados para la integración real con Bitfinex API
    private async authenticatedRequest(method: string, endpoint: string, body?: unknown): Promise<unknown> {
        const url = `${this.baseUrl}${endpoint}`;
        const nonce = Date.now().toString();
        const bodyString = body ? JSON.stringify(body) : '';

        // Crear signature según la documentación de Bitfinex API v2
        const apiPath = endpoint;
        const payload = `/api${apiPath}${nonce}${bodyString}`;
        const signature = crypto.createHmac('sha384', this.secret).update(payload).digest('hex');

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'bfx-nonce': nonce,
            'bfx-apikey': this.key,
            'bfx-signature': signature,
        };

        try {
            console.log(`🌐 Making ${method} request to ${url}`);

            const response = await fetch(url, {
                method,
                headers,
                body: method !== 'GET' ? bodyString : undefined,
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`❌ Bitfinex API error: ${response.status} - ${errorText}`);
            } else {
                console.log(`✅ ${method} request successful: ${response.status}`);
            }

            const result = await response.json();
            console.log('📊 Bitfinex API response:', JSON.stringify(result, null, 2));

            return result;
        } catch (error) {
            console.error('❌ Bitfinex API call failed:', error);
            throw error;
        }
    }

    // Método para obtener información de wallets
    async getWallets(): Promise<unknown> {
        return this.authenticatedRequest('POST', '/v2/auth/r/wallets');
    }
}
