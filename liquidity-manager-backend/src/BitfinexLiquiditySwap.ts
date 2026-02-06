import { LndService } from '@40swap/crypto-clients';
import { BitfinexClient } from './BitfinexClient.js';
import { LiquidService } from './LiquidService.js';
import { LiquiditySwap } from './entities/LiquiditySwap.js';
import { Repository } from 'typeorm';
import { Logger } from '@nestjs/common';
import { LiquiditySwapRunner } from './SwapService.js';

export class BitfinexLiquiditySwap implements LiquiditySwapRunner {
    private readonly logger = new Logger(BitfinexLiquiditySwap.name);

    constructor(
        private id: string,
        private lndService: LndService,
        private elements: LiquidService,
        private bitfinex: BitfinexClient,
        private repository: Repository<LiquiditySwap>,
    ) {}

    async run(): Promise<void> {
        const swap = await this.repository.findOneByOrFail({ id: this.id });
        if (swap.status !== 'CREATED') {
            this.logger.error(`[swap:${swap.id}] Swap is alreay in progress but is not resumable. Failing...`);
            swap.status = 'DONE';
            swap.outcome = 'ERROR';
            swap.errorMessage = 'swap is not resumable';
            await this.repository.save(swap);
            return;
        }
        this.logger.log(`[swap:${swap.id}] Starting complete swap: ${swap.amount} BTC -> Lightning -> Liquid`);

        try {
            // Step 1: Check for existing exchange deposit addresses and create one if needed
            // This is necessary for Bitfinex to accept Lightning deposits
            // For more info check: https://docs.bitfinex.com/reference/rest-auth-deposit-invoice
            const existingAddresses = await this.bitfinex.getDepositAddresses('LNX');

            if (!existingAddresses || (Array.isArray(existingAddresses) && existingAddresses.length === 0)) {
                this.logger.log(`[swap:${swap.id}] No existing deposit addresses found, creating new one...`);
                await this.bitfinex.createDepositAddress('exchange', 'LNX');
                this.logger.log(`[swap:${swap.id}] Deposit address created successfully`);
            } else {
                this.logger.log(`[swap:${swap.id}] Existing deposit addresses found`);
            }

            // Step 2: Generate Lightning invoice
            this.logger.log(`[swap:${swap.id}] Step 2: Generating Lightning invoice...`);
            const invoiceResponse = await this.bitfinex.generateInvoice(swap.amount.toString());

            // Extract invoice and txId from response
            let invoice: string;
            let txId: string;

            if (Array.isArray(invoiceResponse) && invoiceResponse.length > 0) {
                txId = invoiceResponse[0]; // Transaction ID is at index 0
                invoice = invoiceResponse[1]; // Invoice is at index 1
            } else {
                throw new Error('Invalid invoice response format');
            }

            // Step 3: Pay the invoice using LND service
            const paymentResult = await this.payInvoice(invoice, 0, swap.channelId, swap.id);

            if (!paymentResult.success) {
                this.logger.error(`[swap:${swap.id}] Payment failed: ${paymentResult.error}`);
                swap.status = 'DONE';
                swap.outcome = 'ERROR';
                swap.errorMessage = paymentResult.error ?? null;
                await this.repository.save(swap);
                return;
            }

            this.logger.log(`[swap:${swap.id}] Payment successful! Preimage: ${paymentResult.preimage}`);

            // Step 3: Monitor the invoice until it's paid
            this.logger.log(`[swap:${swap.id}] Step 3: Monitoring invoice status...`);
            const monitorResult = await this.bitfinex.monitorInvoice(txId, 100, 10000); // 100 retries, 10 seconds each

            if (!monitorResult.success || monitorResult.finalState !== 'paid') {
                this.logger.error(
                    `[swap:${swap.id}] Invoice was never marked as paid - swap failed. Final state: ${monitorResult.finalState || 'unknown'}. Attempts made: ${monitorResult.attempts}`,
                );
                swap.status = 'DONE';
                swap.outcome = 'ERROR';
                swap.errorMessage = `invoice was never marked as paid`;
                await this.repository.save(swap);
                return;
            }

            this.logger.log(`[swap:${swap.id}] Invoice confirmed as paid! State: ${monitorResult.finalState}`);

            // Step 4: Exchange LNX to BTC
            this.logger.log(`[swap:${swap.id}] Step 4: Converting LNX to BTC...`);
            await this.bitfinex.exchangeCurrency('LNX', 'BTC', swap.amount.toNumber());
            this.logger.log(`[swap:${swap.id}] LNX to BTC conversion submitted successfully`);

            // Step 5: Exchange BTC to LBT (Liquid Bitcoin)
            this.logger.log(`[swap:${swap.id}] Step 5: Converting BTC to LBT...`);
            await this.bitfinex.exchangeCurrency('BTC', 'LBT', swap.amount.toNumber());
            this.logger.log(`[swap:${swap.id}] BTC to LBT conversion submitted successfully`);

            // Step 6: Withdraw LBT to the requested address
            this.logger.log(`[swap:${swap.id}] Step 6: Withdrawing LBT to destination address...`);
            if (!swap.address) {
                this.logger.warn(`[swap:${swap.id}] Liquid destination address not provided, getting one from Elements`);
                swap.address = await this.elements?.getNewAddress();
                this.logger.log(`[swap:${swap.id}] Using new liquid address: ${swap.address}`);
            } else {
                this.logger.log(`[swap:${swap.id}] Using provided liquid address: ${swap.address}`);
            }
            await this.bitfinex.withdraw(swap.amount.toNumber(), swap.address, 'LBT');
            this.logger.log(`[swap:${swap.id}] Withdrawal request submitted successfully`);

            this.logger.log(`[swap:${swap.id}] Complete swap operation finished successfully!`);
            this.logger.log(`[swap:${swap.id}] Summary: ${swap.amount.toFixed()} BTC -> Lightning -> Liquid (${swap.address})`);
        } catch (error) {
            this.logger.error(`[swap:${swap.id}] Swap operation failed:`, error);
            swap.status = 'DONE';
            swap.outcome = 'ERROR';
            swap.errorMessage = (error as Error).message;
            await this.repository.save(swap);
        }
    }

    /**
     * Pays a Lightning Network invoice using the configured LND service.
     * @param invoice - Lightning invoice payment request string
     * @param cltvLimit - CLTV limit for the payment (default: 0)
     * @param channel - Optional specific channel ID to use for the payment (default: null)
     * @param swapId - Swap ID for logging purposes
     * @returns Promise resolving to payment result with success status and preimage
     */
    async payInvoice(
        invoice: string,
        cltvLimit: number = 0,
        channel: number | string | null = null,
        swapId: string,
    ): Promise<{ success: boolean; preimage?: string; error?: string }> {
        const logPrefix = `[swap:${swapId}]`;
        this.logger.log(`${logPrefix} Paying Lightning invoice using LND`);
        this.logger.log(`${logPrefix} Invoice: ${invoice}`);
        this.logger.log(`${logPrefix} CLTV Limit: ${cltvLimit}`);

        if (!this.lndService) {
            const error = 'LndService not configured. Please provide LndService instance in constructor.';
            this.logger.error(`${logPrefix} ${error}`);
            return { success: false, error };
        }

        try {
            this.logger.log(`${logPrefix} Initiating payment through LND...`);
            const preimage = await this.lndService.sendPayment(invoice, cltvLimit, channel);
            const preimageHex = preimage.toString('hex');

            this.logger.log(`${logPrefix} Payment successful!`);
            this.logger.log(`${logPrefix} Preimage: ${preimageHex}`);

            return {
                success: true,
                preimage: preimageHex,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`${logPrefix} Payment failed:`, errorMessage);

            return {
                success: false,
                error: errorMessage,
            };
        }
    }
}
