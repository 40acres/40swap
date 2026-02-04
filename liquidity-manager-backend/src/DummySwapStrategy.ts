import { Injectable, Logger } from '@nestjs/common';
import { SwapStrategy, SwapResult } from './BitfinexSwapStrategy.js';
import Decimal from 'decimal.js';

@Injectable()
export class DummySwapStrategy implements SwapStrategy {
    private readonly logger = new Logger(DummySwapStrategy.name);

    async swapOut(swapId: string, channelId: string, amount: Decimal): Promise<SwapResult> {
        this.logger.log(`[swap:${swapId}] Starting DUMMY swap for channel ${channelId}, amount: ${amount} BTC`);
        this.logger.log(`[swap:${swapId}] This is a test swap - no funds will be moved`);

        // Wait 5 seconds to simulate processing
        await new Promise((resolve) => setTimeout(resolve, 5000));

        this.logger.log(`[swap:${swapId}] DUMMY swap completed successfully`);

        return {
            success: true,
            txid: 'dummy-tx-' + Date.now(),
            address: 'dummy-liquid-address-' + Date.now(),
        };
    }
}
