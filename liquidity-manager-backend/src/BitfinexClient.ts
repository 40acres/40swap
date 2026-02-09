import * as crypto from 'crypto';
import { LiquidityManagerConfiguration } from './configuration.js';

type BitfinexMethod = 'BTC' | 'LNX' | 'LBT';
type BitfinexWalletType = 'exchange' | 'margin' | 'funding';

export class BitfinexClient {
    private readonly baseUrl = 'https://api.bitfinex.com';
    private readonly maxRetries = 20;
    private readonly retryInterval = 5000;

    constructor(private config: LiquidityManagerConfiguration['bitfinex']) {}

    protected async makeHttpRequest(url: string, method: string, headers: Record<string, string>, body?: string): Promise<Response> {
        return fetch(url, {
            method,
            headers,
            body: method !== 'GET' ? body : undefined,
        });
    }

    /**
     * Retrieves wallet information and balances from Bitfinex.
     * @returns Promise resolving to wallet data
     */
    async getWallets(): Promise<unknown> {
        return this.authenticatedRequest('POST', '/v2/auth/r/wallets');
    }

    /**
     * Gets all deposit addresses for a specific currency with pagination support.
     * @param method - Deposit method (bitcoin, LNX, lbtc)
     * @param page - Page number for pagination (default: 1)
     * @param pageSize - Number of addresses per page (default: 100)
     * @returns Promise resolving to deposit addresses data
     */
    async getDepositAddresses(method: BitfinexMethod, page: number = 1, pageSize: number = 100): Promise<unknown> {
        return this.authenticatedRequest('POST', '/v2/auth/r/deposit/address/all', { method, page, pageSize });
    }

    /**
     * Creates a new deposit address for the specified wallet and method.
     * @param wallet - Wallet type (exchange, margin, funding)
     * @param method - Deposit method (bitcoin, LNX, lbtc)
     * @returns Promise resolving to the created address data
     */
    async createDepositAddress(wallet: BitfinexWalletType, method: BitfinexMethod): Promise<unknown> {
        return this.authenticatedRequest('POST', '/v2/auth/w/deposit/address', { wallet, method });
    }

    /**
     * Generates a Lightning Network invoice with the specified amount.
     * Only exchange wallet and LNX currency are supported for Lightning operations.
     * @param amount - Invoice amount as string
     * @returns Promise resolving to the generated invoice data
     * @throws Error if invoice generation fails
     */
    async generateInvoice(amount: string): Promise<unknown> {
        // Only these parameters are supported: https://docs.bitfinex.com/reference/rest-auth-deposit-invoice
        const wallet = 'exchange'; // Only exchange wallet is supported
        const currency = 'LNX'; // Only LNX is supported for Lightning

        // Generate the invoice directly
        const invoiceData = {
            currency,
            wallet,
            amount,
        };

        return this.authenticatedRequest('POST', '/v2/auth/w/deposit/invoice', invoiceData);
    }

    /**
     * Retrieves Lightning Network invoice payments with various query options.
     * @param action - Query action type (getInvoiceById, getPaymentById, etc.)
     * @param query - Query parameters including offset and txid
     * @returns Promise resolving to invoice payments data
     */
    async getLnxInvoicePayments(action: string, query: { offset?: number; txid?: string } = {}): Promise<unknown> {
        return this.authenticatedRequest('POST', '/v2/auth/r/ext/invoice/payments', { action, query });
    }

    /**
     * Monitors an invoice status until it's paid or maximum retries are reached.
     * Continuously polls the invoice status at specified intervals.
     * @param txId - Transaction ID of the invoice to monitor
     * @param maxRetries - Maximum number of retry attempts (default: 10)
     * @param timeoutMs - Interval between checks in milliseconds (default: 5000)
     * @returns Promise resolving to monitoring result with success status and final state
     */
    async monitorInvoice(
        txId: string,
        maxRetries: number = 10,
        timeoutMs: number = 5000,
    ): Promise<{ success: boolean; finalState?: string; invoice?: unknown; attempts: number }> {
        let attempts = 0;

        while (attempts < maxRetries) {
            attempts++;

            try {
                const result = await this.getLnxInvoicePayments('getInvoiceById', { txid: txId });

                // Extract invoice state (assuming it comes in the shown format)
                let invoiceState: string | undefined;
                if (result && typeof result === 'object' && 'state' in result) {
                    invoiceState = (result as Record<string, unknown>).state as string;
                } else if (Array.isArray(result) && result.length > 0 && typeof result[0] === 'object' && 'state' in result[0]) {
                    invoiceState = (result[0] as Record<string, unknown>).state as string;
                }

                // If state is not "not_paid", the invoice has been processed
                if (invoiceState && invoiceState !== 'not_paid') {
                    return {
                        success: true,
                        finalState: invoiceState,
                        invoice: result,
                        attempts,
                    };
                }

                // If not the last attempt, wait before next one
                if (attempts < maxRetries) {
                    await new Promise((resolve) => setTimeout(resolve, timeoutMs));
                }
            } catch (error) {
                // If not the last attempt, continue with the next one
                if (attempts < maxRetries) {
                    await new Promise((resolve) => setTimeout(resolve, timeoutMs));
                } else {
                    // If it's the last attempt, return the error
                    throw error;
                }
            }
        }

        // Maximum retries reached without success
        return {
            success: false,
            finalState: 'not_paid',
            attempts,
        };
    }

    /**
     * Exchanges one currency to another using wallet transfers with conversion.
     * @param fromCurrency - Source currency to convert from
     * @param toCurrency - Target currency to convert to
     * @param amount - Amount to convert
     * @param fromWallet - Source wallet type (default: exchange)
     * @param toWallet - Destination wallet type (default: exchange)
     * @returns Promise resolving to transfer result
     * @throws Error if currency conversion fails
     */
    async exchangeCurrency(
        fromCurrency: string,
        toCurrency: string,
        amount: number,
        fromWallet: BitfinexWalletType = 'exchange',
        toWallet: BitfinexWalletType = 'exchange',
    ): Promise<unknown> {
        const transferData = {
            from: fromWallet,
            to: toWallet,
            currency: fromCurrency,
            currency_to: toCurrency,
            amount: amount.toString(),
        };

        const result = await this.authenticatedRequest('POST', '/v2/auth/w/transfer', transferData);
        return result;
    }

    /**
     * Withdraws funds from Bitfinex account to an external wallet address.
     * @param amount - Amount to withdraw
     * @param address - Destination wallet address
     * @param currency - Currency to withdraw (default: BTC)
     * @param wallet - Source wallet type (default: exchange)
     * @param tag - Optional tag/memo for certain networks
     * @returns Promise resolving to withdrawal result
     * @throws Error if withdrawal submission fails
     */
    async withdraw(amount: number, address: string, currency: BitfinexMethod = 'BTC', wallet: BitfinexWalletType = 'exchange', tag?: string): Promise<unknown> {
        // Parameters for withdrawal according to Bitfinex documentation
        const withdrawData: Record<string, string | boolean> = {
            wallet,
            method: currency,
            amount: amount.toString(),
            address,
            travel_rule_tos: true,
            beneficiary_self: true,
        };

        // Add tag if provided
        if (tag) {
            withdrawData.tag = tag;
        }

        const result = await this.authenticatedRequest('POST', '/v2/auth/w/withdraw', withdrawData);
        return result;
    }

    /**
     * Checks if a response or error should be retried.
     * Checks for success responses with "Settlement / Transfer in progress" message.
     * Also checks for 500 errors with "please wait" message.
     * @param responseOrError - The response or error to check
     * @returns true if the operation should be retried, false otherwise
     */
    private isRetryableResponse(responseOrError: unknown): boolean {
        try {
            // If it's an Error object, check for 500 errors with "please wait" message
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

            // Check if it's a success response with "Settlement / Transfer in progress" message
            // Format: [timestamp, 'acc_wd-req', null, null, [...], null, 'SUCCESS', 'Settlement / Transfer in progress, please try again in few seconds']
            if (Array.isArray(responseOrError) && responseOrError.length >= 8) {
                const status = responseOrError[6];
                const message = responseOrError[7];

                if (
                    status === 'SUCCESS' &&
                    typeof message === 'string' &&
                    message.includes('Settlement / Transfer in progress, please try again in few seconds')
                ) {
                    return true;
                }
            }
        } catch (parseError) {
            // If we can't parse, don't retry
            return false;
        }

        return false;
    }

    /**
     * Wrapper function that handles automatic retries for Bitfinex API calls.
     * Automatically retries when encountering responses that need retry or "Please wait few seconds" errors.
     * @param apiCall - Function that makes the API call
     * @param operation - Description of the operation for logging
     * @returns Promise resolving to the API response
     * @throws Error if all retries are exhausted
     */
    private async withRetry<T>(apiCall: () => Promise<T>, operation: string): Promise<T> {
        let lastError: Error | null = null;
        let lastResponse: T | null = null;

        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                const response = await apiCall();
                lastResponse = response;

                // Check if the successful response requires retry
                if (this.isRetryableResponse(response) && attempt < this.maxRetries) {
                    await new Promise((resolve) => setTimeout(resolve, this.retryInterval));
                    continue;
                }

                // Response doesn't need retry, return it
                return response;
            } catch (error) {
                lastError = error as Error;

                if (this.isRetryableResponse(lastError) && attempt < this.maxRetries) {
                    await new Promise((resolve) => setTimeout(resolve, this.retryInterval));
                } else {
                    // Not retryable error or max retries reached
                    break;
                }
            }
        }

        // All retries exhausted - throw error or return last response
        if (lastError) {
            throw lastError;
        } else if (lastResponse !== null) {
            // If we have a response but it still requires retry, return it anyway
            return lastResponse;
        } else {
            throw new Error(`Operation ${operation} failed after ${this.maxRetries} attempts`);
        }
    }

    /**
     * Makes an authenticated request to the Bitfinex API v2.
     * Creates the required signature according to Bitfinex documentation.
     * @param method - HTTP method (GET, POST, etc.)
     * @param endpoint - API endpoint path
     * @param body - Optional request body
     * @returns Promise resolving to the API response
     * @throws Error if the API request fails
     */
    private async authenticatedRequest(method: string, endpoint: string, body?: unknown): Promise<unknown> {
        return this.withRetry(async () => {
            const url = `${this.baseUrl}${endpoint}`;
            const nonce = Date.now().toString();
            const bodyString = body ? JSON.stringify(body) : '';

            // Create signature according to Bitfinex API v2 documentation
            const apiPath = endpoint;
            const payload = `/api${apiPath}${nonce}${bodyString}`;
            const signature = crypto.createHmac('sha384', this.config.apiSecret).update(payload).digest('hex');

            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                'bfx-nonce': nonce,
                'bfx-apikey': this.config.apiKey,
                'bfx-signature': signature,
            };

            const response = await this.makeHttpRequest(url, method, headers, bodyString);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Bitfinex API error: ${response.status} - ${errorText}`);
            }

            return await response.json();
        }, `${method} ${endpoint}`);
    }
}
