import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LiquidityManagerConfiguration } from './configuration.js';
import * as crypto from 'crypto';
import fetch from 'node-fetch';

export interface SwapStrategy {
    swapOut(channelId: string, amountSats: number): Promise<SwapResult>;
}

export interface SwapResult {
    success: boolean;
    txid?: string;
    error?: string;
}

@Injectable()
export class BitfinexSwapStrategy implements SwapStrategy {
    private readonly logger = new Logger(BitfinexSwapStrategy.name);
    private readonly baseUrl = 'https://api.bitfinex.com';
    private readonly apiKey: string;
    private readonly apiSecret: string;

    constructor(private readonly configService: ConfigService<LiquidityManagerConfiguration>) {
        const config = this.configService.getOrThrow('bitfinex', { infer: true });
        this.apiKey = config.apiKey;
        this.apiSecret = config.apiSecret;
    }

    async swapOut(channelId: string, amountSats: number): Promise<SwapResult> {
        this.logger.log(`Initiating Bitfinex swap out for channel ${channelId}, amount: ${amountSats} sats`);

        try {
            // Convert sats to BTC
            const amountBtc = amountSats / 100000000;

            // Create withdrawal from Lightning to exchange wallet
            const result = await this.withdraw('LNX', 'exchange', amountBtc);

            this.logger.log(`Bitfinex swap completed successfully`);
            return {
                success: true,
                txid: 'result.toString()',
            };
        } catch (error) {
            this.logger.error(`Bitfinex swap failed: ${error}`);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    private async withdraw(currency: string, walletType: string, amount: number): Promise<unknown> {
        const path = '/v2/auth/w/withdraw';
        const nonce = Date.now().toString();
        const body = {
            wallet: walletType,
            method: currency,
            amount: amount.toString(),
        };

        const signature = this.generateSignature(path, nonce, body);
        const response = await fetch(`${this.baseUrl}${path}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'bfx-nonce': nonce,
                'bfx-apikey': this.apiKey,
                'bfx-signature': signature,
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Bitfinex API error: ${response.status} - ${errorText}`);
        }

        return response.json();
    }

    private generateSignature(path: string, nonce: string, body: unknown): string {
        const payload = `/api${path}${nonce}${JSON.stringify(body)}`;
        return crypto.createHmac('sha384', this.apiSecret).update(payload).digest('hex');
    }
}
