import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { LiquiditySwap } from './entities/LiquiditySwap.js';
import { LiquiditySwapRunner } from './SwapService.js';
import { PeerswapClient, PEERSWAP_FAILURE_STATES, PEERSWAP_SUCCESS_STATES } from './PeerswapClient.js';

const POLL_INTERVAL_MS = 10_000;
const POLL_MAX_ATTEMPTS = 60; // 10 minutes max

export class PeerswapLiquiditySwap implements LiquiditySwapRunner {
    private readonly logger = new Logger(PeerswapLiquiditySwap.name);

    constructor(
        private readonly swapId: string,
        private readonly peerswapClient: PeerswapClient,
        private readonly swapRepository: Repository<LiquiditySwap>,
    ) {}

    async run(): Promise<void> {
        const swap = await this.swapRepository.findOneByOrFail({ id: this.swapId });
        this.logger.log(`[swap:${this.swapId}] Starting peerswap-out for channel ${swap.channelId}, amount: ${swap.amount} BTC`);

        swap.status = 'IN_PROGRESS';
        await this.swapRepository.save(swap);

        try {
            const satAmount = swap.amount.mul(1e8).toDecimalPlaces(0).toNumber();
            const peerswap = await this.peerswapClient.swapOut(swap.channelId, satAmount, 'btc');
            this.logger.log(`[swap:${this.swapId}] Peerswap initiated, peerswap id: ${peerswap.id}, state: ${peerswap.state}`);
            swap.providerTxId = peerswap.id;
            await this.swapRepository.save(swap);

            const finalState = await this.pollUntilDone(peerswap.id);

            if (PEERSWAP_SUCCESS_STATES.includes(finalState)) {
                this.logger.log(`[swap:${this.swapId}] Peerswap completed successfully (state: ${finalState})`);
                swap.status = 'DONE';
                swap.outcome = 'SUCCESS';
            } else {
                this.logger.error(`[swap:${this.swapId}] Peerswap failed (state: ${finalState})`);
                swap.status = 'DONE';
                swap.outcome = 'ERROR';
                swap.errorMessage = `peerswap ended in state: ${finalState}`;
            }
        } catch (error) {
            this.logger.error(`[swap:${this.swapId}] Peerswap error:`, error);
            swap.status = 'DONE';
            swap.outcome = 'ERROR';
            swap.errorMessage = (error as Error).message;
        }

        await this.swapRepository.save(swap);
    }

    private async pollUntilDone(peerswapId: string): Promise<string> {
        for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
            const peerswap = await this.peerswapClient.getSwap(peerswapId);
            this.logger.log(`[swap:${this.swapId}] Poll ${attempt + 1}/${POLL_MAX_ATTEMPTS}: peerswap state=${peerswap.state}`);

            if (PEERSWAP_SUCCESS_STATES.includes(peerswap.state) || PEERSWAP_FAILURE_STATES.includes(peerswap.state)) {
                return peerswap.state;
            }
        }
        return 'State_Timeout';
    }
}
