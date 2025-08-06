import { SwapProvider } from './SwapProvider.js';
import { LndService } from '../LndService.js';
import * as crypto from 'crypto';

type BitfinexMethod = 'bitcoin' | 'LNX' | 'lbtc';
type BitfinexWalletType = 'exchange' | 'margin' | 'funding';

/**
 * Bitfinex swap provider implementation for interacting with Bitfinex API v2.
 * Supports Lightning Network operations, wallet management, and currency exchanges.
 */
export class BitfinexProvider extends SwapProvider {
    private baseUrl = 'https://api.bitfinex.com';
    private lndService?: LndService;

    /**
     * Creates a new BitfinexProvider instance.
     * @param key - Bitfinex API key
     * @param secret - Bitfinex API secret
     * @param lndService - Optional LND service for Lightning Network operations
     */
    constructor(key: string, secret: string, lndService?: LndService) {
        super('Bitfinex', key, secret);
        this.lndService = lndService;
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
        const url = `${this.baseUrl}${endpoint}`;
        const nonce = Date.now().toString();
        const bodyString = body ? JSON.stringify(body) : '';

        // Create signature according to Bitfinex API v2 documentation
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
            const response = await this.makeHttpRequest(url, method, headers, bodyString);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`❌ Bitfinex API error: ${response.status} - ${errorText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('❌ Bitfinex API call failed:', error);
            throw error;
        }
    }

    /**
     * Executes a complete swap operation: amount BTC → Lightning → Liquid.
     * @param amount - Amount to swap in BTC
     * @param liquidAddress - Destination Liquid wallet address
     */
    async swap(amount: number, liquidAddress: string): Promise<void> {
        console.log(`🔄 Starting complete swap: ${amount} BTC → Lightning → Liquid`);

        try {
            // Step 1: Check for existing deposit addresses and create one if needed
            // This is necessary for Bitfinex to accept Lightning deposits
            // For more info check: https://docs.bitfinex.com/reference/rest-auth-deposit-invoice
            console.log('🔍 Step 1: Checking existing deposit addresses...');
            const existingAddresses = await this.getDepositAddresses('LNX');

            if (!existingAddresses || (Array.isArray(existingAddresses) && existingAddresses.length === 0)) {
                console.log('📍 No existing deposit addresses found, creating new one...');
                await this.createDepositAddress('exchange', 'LNX');
                console.log('✅ Deposit address created successfully');
            } else {
                console.log('✅ Existing deposit addresses found');
            }

            // Step 2: Generate Lightning invoice
            console.log('⚡ Step 2: Generating Lightning invoice...');
            const invoiceResponse = await this.generateInvoice(amount.toString());

            // Extract invoice and txId from response
            let invoice: string;
            let txId: string;

            if (Array.isArray(invoiceResponse) && invoiceResponse.length > 0) {
                const invoiceData = invoiceResponse[0];
                invoice = invoiceData[5]; // Invoice is typically at index 5
                txId = invoiceData[0]; // Transaction ID is typically at index 0
            } else {
                throw new Error('Invalid invoice response format');
            }

            console.log(`✅ Invoice generated: ${invoice.substring(0, 20)}...`);
            console.log(`🆔 Transaction ID: ${txId}`);

            // Step 3: Pay the invoice using LND service
            console.log('💸 Step 3: Paying Lightning invoice...');
            const paymentResult = await this.payInvoice(invoice);

            if (!paymentResult.success) {
                throw new Error(`Payment failed: ${paymentResult.error}`);
            }

            console.log(`✅ Payment successful! Preimage: ${paymentResult.preimage}`);

            // Step 4: Monitor the invoice until it's paid
            console.log('🔍 Step 4: Monitoring invoice status...');
            const monitorResult = await this.monitorInvoice(txId, 20, 3000); // 20 retries, 3 seconds each

            if (!monitorResult.success || monitorResult.finalState !== 'paid') {
                console.log('❌ Step 7: Invoice was never marked as paid - swap failed');
                console.log(`📊 Final state: ${monitorResult.finalState || 'unknown'}`);
                console.log(`🔄 Attempts made: ${monitorResult.attempts}`);
                throw new Error(`Invoice monitoring failed. Final state: ${monitorResult.finalState}`);
            }

            console.log(`✅ Invoice confirmed as paid! State: ${monitorResult.finalState}`);

            // Step 5: Exchange BTC to LBTC
            console.log('🔄 Step 5: Converting BTC to LBTC...');
            await this.exchangeCurrency('BTC', 'LBTC', amount);
            console.log('✅ Currency exchange submitted successfully');

            // Step 6: Withdraw LBTC to the requested address
            console.log('💰 Step 6: Withdrawing LBTC to destination address...');
            await this.withdraw(amount, liquidAddress, 'lbtc');
            console.log('✅ Withdrawal request submitted successfully');

            console.log('🎉 Complete swap operation finished successfully!');
            console.log(`📊 Summary: ${amount} BTC → Lightning → Liquid (${liquidAddress})`);
        } catch (error) {
            console.error('❌ Swap operation failed:', error);
            throw error;
        }
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
        console.log(`📋 Getting deposit addresses`);
        return this.authenticatedRequest('POST', '/v2/auth/r/deposit/address/all', { method, page, pageSize });
    }

    /**
     * Creates a new deposit address for the specified wallet and method.
     * @param wallet - Wallet type (exchange, margin, funding)
     * @param method - Deposit method (bitcoin, LNX, lbtc)
     * @returns Promise resolving to the created address data
     */
    async createDepositAddress(wallet: BitfinexWalletType, method: BitfinexMethod): Promise<unknown> {
        console.log(`🆕 Creating deposit address for ${method} in ${wallet} wallet`);
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
        console.log(`⚡ Generating Lightning invoice for ${amount}`);

        // Only these parameters are supported: https://docs.bitfinex.com/reference/rest-auth-deposit-invoice
        const wallet = 'exchange'; // Only exchange wallet is supported
        const currency = 'LNX'; // Only LNX is supported for Lightning

        try {
            // Generate the invoice directly
            console.log('💫 Generating Lightning invoice...');
            const invoiceData = {
                currency,
                wallet,
                amount,
            };

            return this.authenticatedRequest('POST', '/v2/auth/w/deposit/invoice', invoiceData);
        } catch (error) {
            console.error('❌ Error generating Lightning invoice:', error);
            throw error;
        }
    }

    /**
     * Retrieves Lightning Network invoice payments with various query options.
     * @param action - Query action type (getInvoiceById, getPaymentById, etc.)
     * @param query - Query parameters including offset and txid
     * @returns Promise resolving to invoice payments data
     */
    async getLnxInvoicePayments(action: string, query: { offset?: number; txid?: string } = {}): Promise<unknown> {
        console.log(`📋 Getting LNX invoice payments with action: ${action}`);
        return this.authenticatedRequest('POST', '/v2/auth/r/ext/invoice/payments', { action, query });
    }

    /**
     * Pays a Lightning Network invoice using the configured LND service.
     * @param invoice - Lightning invoice payment request string
     * @param cltvLimit - CLTV limit for the payment (default: 40)
     * @param options - Additional payment options (timeout, maxFeePercent)
     * @returns Promise resolving to payment result with success status and preimage
     */
    async payInvoice(
        invoice: string,
        cltvLimit: number = 40,
        options: {
            timeout?: number;
            maxFeePercent?: number;
        } = {},
    ): Promise<{ success: boolean; preimage?: string; error?: string }> {
        console.log(`⚡ Paying Lightning invoice using LND`);
        console.log(`🎫 Invoice: ${invoice.substring(0, 20)}...`);
        console.log(`⏰ CLTV Limit: ${cltvLimit}`);

        if (!this.lndService) {
            const error = 'LndService not configured. Please provide LndService instance in constructor.';
            console.error(`❌ ${error}`);
            return { success: false, error };
        }

        try {
            console.log(`🚀 Initiating payment through LND...`);
            const preimage = await this.lndService.sendPayment(invoice, cltvLimit);
            const preimageHex = preimage.toString('hex');

            console.log(`✅ Payment successful!`);
            console.log(`🔑 Preimage: ${preimageHex}`);

            return {
                success: true,
                preimage: preimageHex,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`❌ Payment failed:`, errorMessage);

            return {
                success: false,
                error: errorMessage,
            };
        }
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
        console.log(`🔍 Starting invoice monitoring for txId: ${txId}`);
        console.log(`⚙️ Config: maxRetries=${maxRetries}, timeout=${timeoutMs}ms`);

        let attempts = 0;

        while (attempts < maxRetries) {
            attempts++;
            console.log(`📡 Attempt ${attempts}/${maxRetries} - Checking invoice status...`);

            try {
                const result = await this.getLnxInvoicePayments('getInvoiceById', { txid: txId });

                // Extract invoice state (assuming it comes in the shown format)
                let invoiceState: string | undefined;
                if (result && typeof result === 'object' && 'state' in result) {
                    invoiceState = (result as Record<string, unknown>).state as string;
                } else if (Array.isArray(result) && result.length > 0 && typeof result[0] === 'object' && 'state' in result[0]) {
                    invoiceState = (result[0] as Record<string, unknown>).state as string;
                }

                console.log(`📊 Invoice state: ${invoiceState || 'unknown'}`);

                // If state is not "not_paid", the invoice has been processed
                if (invoiceState && invoiceState !== 'not_paid') {
                    console.log(`✅ Invoice monitoring completed! Final state: ${invoiceState}`);
                    return {
                        success: true,
                        finalState: invoiceState,
                        invoice: result,
                        attempts,
                    };
                }

                // If not the last attempt, wait before next one
                if (attempts < maxRetries) {
                    console.log(`⏳ Waiting ${timeoutMs}ms before next attempt...`);
                    await new Promise((resolve) => setTimeout(resolve, timeoutMs));
                }
            } catch (error) {
                console.error(`❌ Error on attempt ${attempts}:`, error);

                // If not the last attempt, continue with the next one
                if (attempts < maxRetries) {
                    console.log(`⏳ Waiting ${timeoutMs}ms before retry...`);
                    await new Promise((resolve) => setTimeout(resolve, timeoutMs));
                } else {
                    // If it's the last attempt, return the error
                    throw error;
                }
            }
        }

        // Maximum retries reached without success
        console.log(`⏰ Maximum retries (${maxRetries}) reached. Invoice still in 'not_paid' state.`);
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
        console.log(`🔄 Converting ${amount} ${fromCurrency} to ${toCurrency}`);
        console.log(`📤 From wallet: ${fromWallet}`);
        console.log(`📥 To wallet: ${toWallet}`);

        const transferData = {
            from: fromWallet,
            to: toWallet,
            currency: fromCurrency,
            currency_to: toCurrency,
            amount: amount.toString(),
        };

        try {
            const result = await this.authenticatedRequest('POST', '/v2/auth/w/transfer', transferData);
            console.log(`✅ Currency conversion transfer submitted successfully`);
            return result;
        } catch (error) {
            console.error('❌ Error submitting currency conversion transfer:', error);
            throw error;
        }
    }

    /**
     * Withdraws funds from Bitfinex account to an external wallet address.
     * @param amount - Amount to withdraw
     * @param address - Destination wallet address
     * @param currency - Currency to withdraw (default: bitcoin)
     * @param wallet - Source wallet type (default: exchange)
     * @param tag - Optional tag/memo for certain networks
     * @returns Promise resolving to withdrawal result
     * @throws Error if withdrawal submission fails
     */
    async withdraw(
        amount: number,
        address: string,
        currency: BitfinexMethod = 'bitcoin',
        wallet: BitfinexWalletType = 'exchange',
        tag?: string,
    ): Promise<unknown> {
        console.log(`💰 Withdrawing ${amount} ${currency.toUpperCase()} to address: ${address}`);

        // Parameters for withdrawal according to Bitfinex documentation
        const withdrawData: Record<string, string> = {
            wallet,
            method: currency,
            amount: amount.toString(),
            address,
        };

        // Add tag if provided
        if (tag) {
            withdrawData.tag = tag;
        }

        try {
            const result = await this.authenticatedRequest('POST', '/v2/auth/w/withdraw', withdrawData);
            console.log(`✅ Withdrawal request submitted successfully`);
            console.log(`📄 Transaction details:`, result);
            return result;
        } catch (error) {
            console.error('❌ Error submitting withdrawal:', error);
            throw error;
        }
    }
}
