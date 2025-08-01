import { SwapProvider } from './SwapProvider.js';
import * as crypto from 'crypto';

// Tipos específicos para Bitfinex API
type BitfinexMethod = 'bitcoin' | 'LNX';
type BitfinexWalletType = 'exchange' | 'margin' | 'funding';

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

            return await response.json();
        } catch (error) {
            console.error('❌ Bitfinex API call failed:', error);
            throw error;
        }
    }

    // Método para obtener información de wallets
    async getWallets(): Promise<unknown> {
        return this.authenticatedRequest('POST', '/v2/auth/r/wallets');
    }

    // Método para obtener todas las direcciones de depósito para una moneda específica
    async getDepositAddresses(method: BitfinexMethod, page: number = 1, pageSize: number = 100): Promise<unknown> {
        console.log(`📋 Getting deposit addresses`);
        return this.authenticatedRequest('POST', '/v2/auth/r/deposit/address/all', { method, page, pageSize });
    }

    // Método para crear una nueva dirección de depósito
    async createDepositAddress(wallet: BitfinexWalletType, method: BitfinexMethod): Promise<unknown> {
        console.log(`🆕 Creating deposit address for ${method} in ${wallet} wallet`);
        const requestBody: Record<string, string> = { wallet, method };
        return this.authenticatedRequest('POST', '/v2/auth/w/deposit/address', requestBody);
    }
}
