import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LiquidityManagerConfiguration } from './configuration.js';
import { LndService } from './LndService.js';
import { LiquidService } from './LiquidService.js';
import * as crypto from 'crypto';
import fetch from 'node-fetch';

export interface SwapStrategy {
    swapOut(channelId: string, amountSats: number): Promise<SwapResult>;
}

export interface SwapResult {
    success: boolean;
    txid?: string;
    liquidAddress?: string;
    error?: string;
}

@Injectable()
export class BitfinexSwapStrategy implements SwapStrategy {
    private readonly logger = new Logger(BitfinexSwapStrategy.name);
    private readonly baseUrl = 'https://api.bitfinex.com';
    private readonly apiKey: string;
    private readonly apiSecret: string;
    private readonly maxRetries = 20;
    private readonly retryInterval = 5000;

    constructor(
        private readonly configService: ConfigService<LiquidityManagerConfiguration>,
        private readonly lndService: LndService,
        private readonly liquidService: LiquidService,
    ) {
        const config = this.configService.getOrThrow('bitfinex', { infer: true });
        this.apiKey = config.apiKey;
        this.apiSecret = config.apiSecret;
    }

    async swapOut(channelId: string, amountSats: number): Promise<SwapResult> {
        this.logger.log(`Starting Bitfinex swap out for channel ${channelId}, amount: ${amountSats} sats`);

        try {
            const amountBtc = amountSats / 100000000;

            this.logger.log('Step 1: Getting Liquid address from Elements');
            const liquidAddress = await this.liquidService.getNewAddress();
            this.logger.log(`Liquid address: ${liquidAddress}`);

            this.logger.log('Step 2: Checking for existing deposit addresses');
            const existingAddresses = await this.getDepositAddresses('LNX');
            if (!existingAddresses || (Array.isArray(existingAddresses) && existingAddresses.length === 0)) {
                this.logger.log('No existing deposit addresses found, creating new one');
                await this.createDepositAddress('exchange', 'LNX');
                this.logger.log('Deposit address created successfully');
            }

            this.logger.log('Step 3: Generating Lightning invoice from Bitfinex');
            const invoiceResponse = await this.generateInvoice(amountBtc.toString());

            let invoice: string;
            let txId: string;

            if (Array.isArray(invoiceResponse) && invoiceResponse.length > 1) {
                txId = invoiceResponse[0];
                invoice = invoiceResponse[1];
                this.logger.log(`Invoice generated - txId: ${txId}`);
            } else {
                throw new Error('Invalid invoice response format');
            }

            this.logger.log('Step 4: Paying Lightning invoice via LND');
            const preimage = await this.lndService.sendPayment(invoice);
            this.logger.log(`Payment successful! Preimage: ${preimage.toString('hex')}`);

            this.logger.log('Step 5: Monitoring invoice status');
            const monitorResult = await this.monitorInvoice(txId, 100, 10000);

            if (!monitorResult.success || monitorResult.finalState !== 'paid') {
                throw new Error(`Invoice monitoring failed. Final state: ${monitorResult.finalState}`);
            }

            this.logger.log(`Invoice confirmed as paid! State: ${monitorResult.finalState}`);

            this.logger.log('Step 6: Converting LNX to BTC');
            await this.exchangeCurrency('LNX', 'BTC', amountBtc);
            this.logger.log('LNX to BTC conversion submitted');

            this.logger.log('Step 7: Converting BTC to LBT');
            await this.exchangeCurrency('BTC', 'LBT', amountBtc);
            this.logger.log('BTC to LBT conversion submitted');

            this.logger.log('Step 8: Withdrawing LBT to Liquid address');
            await this.withdraw(amountBtc, liquidAddress, 'LBT');
            this.logger.log('Withdrawal request submitted successfully');

            this.logger.log('Swap completed successfully!');
            return {
                success: true,
                txid: txId,
                liquidAddress,
            };
        } catch (error) {
            this.logger.error(`Bitfinex swap failed: ${error}`);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    private async authenticatedRequest(method: string, endpoint: string, body?: unknown): Promise<unknown> {
        return this.withRetry(async () => {
            const url = `${this.baseUrl}${endpoint}`;
            const nonce = Date.now().toString();
            const bodyString = body ? JSON.stringify(body) : '';

            const apiPath = endpoint;
            const payload = `/api${apiPath}${nonce}${bodyString}`;
            const signature = crypto.createHmac('sha384', this.apiSecret).update(payload).digest('hex');

            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                'bfx-nonce': nonce,
                'bfx-apikey': this.apiKey,
                'bfx-signature': signature,
            };

            const response = await fetch(url, {
                method,
                headers,
                body: bodyString || undefined,
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Bitfinex API error: ${response.status} - ${errorText}`);
            }

            return response.json();
        }, `${method} ${endpoint}`);
    }

    private async withRetry<T>(apiCall: () => Promise<T>, operation: string): Promise<T> {
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                const response = await apiCall();

                if (this.isRetryableResponse(response) && attempt < this.maxRetries) {
                    this.logger.warn(`${operation} requires retry (attempt ${attempt}/${this.maxRetries})`);
                    await new Promise((resolve) => setTimeout(resolve, this.retryInterval));
                    continue;
                }

                return response;
            } catch (error) {
                lastError = error as Error;

                if (this.isRetryableResponse(lastError) && attempt < this.maxRetries) {
                    this.logger.warn(`${operation} failed (attempt ${attempt}/${this.maxRetries}): ${lastError.message}`);
                    await new Promise((resolve) => setTimeout(resolve, this.retryInterval));
                } else {
                    break;
                }
            }
        }

        if (lastError) {
            throw lastError;
        }

        throw new Error(`Operation ${operation} failed after ${this.maxRetries} attempts`);
    }

    private isRetryableResponse(responseOrError: unknown): boolean {
        try {
            if (responseOrError instanceof Error) {
                if (responseOrError.message.includes('500')) {
                    const jsonMatch = responseOrError.message.match(/\[(.*)\]/);
                    if (jsonMatch) {
                        const errorArray = JSON.parse(`[${jsonMatch[1]}]`);
                        if (Array.isArray(errorArray) && errorArray.length > 2) {
                            const errorMessage = errorArray[2];
                            if (typeof errorMessage === 'string' && errorMessage.toLowerCase().includes('please wait')) {
                                return true;
                            }
                        }
                    }
                }
                return false;
            }

            if (Array.isArray(responseOrError) && responseOrError.length >= 8) {
                const status = responseOrError[6];
                const message = responseOrError[7];

                if (status === 'SUCCESS' && typeof message === 'string' && message.includes('Settlement / Transfer in progress')) {
                    return true;
                }
            }
        } catch {
            return false;
        }

        return false;
    }

    private async getDepositAddresses(method: string): Promise<unknown> {
        return this.authenticatedRequest('POST', '/v2/auth/r/deposit/address/all', { method, page: 1, pageSize: 100 });
    }

    private async createDepositAddress(wallet: string, method: string): Promise<unknown> {
        return this.authenticatedRequest('POST', '/v2/auth/w/deposit/address', { wallet, method });
    }

    private async generateInvoice(amount: string): Promise<unknown> {
        const invoiceData = {
            currency: 'LNX',
            wallet: 'exchange',
            amount,
        };
        return this.authenticatedRequest('POST', '/v2/auth/w/deposit/invoice', invoiceData);
    }

    private async getLnxInvoicePayments(action: string, query: { offset?: number; txid?: string } = {}): Promise<unknown> {
        return this.authenticatedRequest('POST', '/v2/auth/r/ext/invoice/payments', { action, query });
    }

    private async monitorInvoice(
        txId: string,
        maxRetries: number = 100,
        timeoutMs: number = 10000,
    ): Promise<{ success: boolean; finalState?: string; invoice?: unknown; attempts: number }> {
        this.logger.log(`Monitoring invoice for txId: ${txId}`);

        let attempts = 0;

        while (attempts < maxRetries) {
            attempts++;

            try {
                const result = await this.getLnxInvoicePayments('getInvoiceById', { txid: txId });

                let invoiceState: string | undefined;
                if (result && typeof result === 'object' && 'state' in result) {
                    invoiceState = (result as Record<string, unknown>).state as string;
                } else if (Array.isArray(result) && result.length > 0 && typeof result[0] === 'object' && 'state' in result[0]) {
                    invoiceState = (result[0] as Record<string, unknown>).state as string;
                }

                if (invoiceState && invoiceState !== 'not_paid') {
                    this.logger.log(`Invoice monitoring completed! Final state: ${invoiceState}`);
                    return {
                        success: true,
                        finalState: invoiceState,
                        invoice: result,
                        attempts,
                    };
                }

                if (attempts < maxRetries) {
                    await new Promise((resolve) => setTimeout(resolve, timeoutMs));
                }
            } catch (error) {
                this.logger.error(`Error on attempt ${attempts}:`, error);

                if (attempts < maxRetries) {
                    await new Promise((resolve) => setTimeout(resolve, timeoutMs));
                } else {
                    throw error;
                }
            }
        }

        this.logger.warn(`Maximum retries (${maxRetries}) reached. Invoice still in not_paid state.`);
        return {
            success: false,
            finalState: 'not_paid',
            attempts,
        };
    }

    private async exchangeCurrency(fromCurrency: string, toCurrency: string, amount: number): Promise<unknown> {
        const transferData = {
            from: 'exchange',
            to: 'exchange',
            currency: fromCurrency,
            currency_to: toCurrency,
            amount: amount.toString(),
        };

        return this.authenticatedRequest('POST', '/v2/auth/w/transfer', transferData);
    }

    private async withdraw(amount: number, address: string, currency: string): Promise<unknown> {
        const withdrawData = {
            wallet: 'exchange',
            method: currency,
            amount: amount.toString(),
            address,
            travel_rule_tos: true,
            beneficiary_self: true,
        };

        return this.authenticatedRequest('POST', '/v2/auth/w/withdraw', withdrawData);
    }
}
