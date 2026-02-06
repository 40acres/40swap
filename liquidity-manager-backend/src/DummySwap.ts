import { Logger } from '@nestjs/common';
import { LiquiditySwapRunner } from './SwapService.js';
import { Repository } from 'typeorm';
import { LiquiditySwap } from './entities/LiquiditySwap.js';

export class DummySwap implements LiquiditySwapRunner {
    private readonly logger = new Logger(DummySwap.name);

    constructor(
        private readonly swapId: string,
        private swapRepository: Repository<LiquiditySwap>,
    ) {}

    async run(): Promise<void> {
        const swap = await this.swapRepository.findOneByOrFail({ id: this.swapId });
        const { channelId, amount } = swap;
        this.logger.log(`[swap:${this.swapId}] Starting DUMMY swap for channel ${channelId}, amount: ${amount} BTC`);
        this.logger.log(`[swap:${this.swapId}] This is a test swap - no funds will be moved`);
        swap.status = 'IN_PROGRESS';
        await this.swapRepository.save(swap);

        // Wait 5 seconds to simulate processing
        await new Promise((resolve) => setTimeout(resolve, 5000));

        swap.status = 'DONE';
        swap.outcome = 'SUCCESS';
        await this.swapRepository.save(swap);

        this.logger.log(`[swap:${this.swapId}] DUMMY swap completed successfully`);
    }
}
