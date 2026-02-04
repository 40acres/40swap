import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChannelsService } from './ChannelsService.js';
import { BitfinexSwapStrategy, SwapStrategy } from './BitfinexSwapStrategy.js';
import { DummySwapStrategy } from './DummySwapStrategy.js';
import { LiquiditySwap, LiquiditySwapStatus, LiquiditySwapOutcome } from './entities/LiquiditySwap.js';
import Decimal from 'decimal.js';
import * as crypto from 'crypto';

export interface SwapRequest {
    channelId: string;
    amount: Decimal;
    strategy?: string;
}

export interface SwapInitiateResponse {
    swapId: string;
    message: string;
}

@Injectable()
export class SwapService {
    private readonly logger = new Logger(SwapService.name);
    private readonly strategies: Map<string, SwapStrategy>;

    constructor(
        private readonly channelsService: ChannelsService,
        private readonly bitfinexStrategy: BitfinexSwapStrategy,
        private readonly dummyStrategy: DummySwapStrategy,
        @InjectRepository(LiquiditySwap)
        private readonly swapRepository: Repository<LiquiditySwap>,
    ) {
        this.strategies = new Map();
        this.strategies.set('bitfinex', this.bitfinexStrategy);
        this.strategies.set('dummy', this.dummyStrategy);
    }

    getAvailableStrategies(): string[] {
        return Array.from(this.strategies.keys());
    }

    async initiateSwap(request: SwapRequest): Promise<SwapInitiateResponse> {
        const strategyName = request.strategy || 'bitfinex';

        const strategy = this.strategies.get(strategyName);
        if (!strategy) {
            throw new BadRequestException(`Unknown strategy: ${strategyName}. Available strategies: ${this.getAvailableStrategies().join(', ')}`);
        }

        const channel = await this.channelsService.getChannelById(request.channelId);
        if (!channel) {
            throw new BadRequestException(`Channel ${request.channelId} not found`);
        }

        const localBalance = parseInt(channel.localBalance, 10);
        if (request.amount.gt(localBalance)) {
            throw new BadRequestException(`Insufficient balance. Channel has ${localBalance} sats, requested ${request.amount} sats`);
        }

        if (request.amount.lte(0)) {
            throw new BadRequestException('Amount must be positive');
        }

        // Create swap record in database
        const swapId = crypto.randomBytes(16).toString('hex');
        this.logger.log(`[swap:${swapId}] Initiating swap - channel: ${request.channelId}, amount: ${request.amount} sats, strategy: ${strategyName}`);

        const swap = this.swapRepository.create({
            id: swapId,
            channelId: request.channelId,
            peerAlias: channel.peerAlias,
            remotePubkey: channel.remotePubkey,
            amount: request.amount,
            strategy: strategyName,
            status: LiquiditySwapStatus.PENDING,
        });

        await this.swapRepository.save(swap);
        this.logger.log(`[swap:${swapId}] Swap record created in database`);

        // Execute swap in background (don't await)
        this.executeSwapInBackground(swapId, strategy, request.channelId, request.amount).catch((error) => {
            this.logger.error(`[swap:${swapId}] Unhandled error in background execution:`, error);
        });

        return {
            swapId,
            message: 'Swap initiated successfully. Check swap history for status updates.',
        };
    }

    private async executeSwapInBackground(swapId: string, strategy: SwapStrategy, channelId: string, amount: Decimal): Promise<void> {
        this.logger.log(`[swap:${swapId}] Starting background execution`);

        try {
            // Execute the swap with selected strategy
            const result = await strategy.swapOut(swapId, channelId, amount);

            // Fetch the swap record to update it
            const swap = await this.swapRepository.findOne({ where: { id: swapId } });
            if (!swap) {
                this.logger.error(`[swap:${swapId}] Swap record not found in database after execution`);
                return;
            }

            if (result.success) {
                // Calculate cost (we'll update this with actual routing fees if available)
                const estimatedCost = new Decimal(amount).mul(0.001); // Estimate 0.1% cost

                // Update swap record with success
                swap.status = LiquiditySwapStatus.COMPLETED;
                swap.outcome = LiquiditySwapOutcome.SUCCESS;
                swap.providerTxId = result.txid || null;
                swap.address = result.address || null;
                swap.cost = estimatedCost;
                swap.completedAt = new Date();
                await this.swapRepository.save(swap);

                this.logger.log(`[swap:${swapId}] Swap completed successfully - txId: ${result.txid}, address: ${result.address}`);
            } else {
                // Update swap record with failure
                swap.status = LiquiditySwapStatus.FAILED;
                swap.outcome = LiquiditySwapOutcome.FAILED;
                swap.errorMessage = result.error || null;
                swap.completedAt = new Date();
                await this.swapRepository.save(swap);

                this.logger.error(`[swap:${swapId}] Swap failed - error: ${result.error}`);
            }
        } catch (error) {
            // Update swap record with error
            const swap = await this.swapRepository.findOne({ where: { id: swapId } });
            if (swap) {
                swap.status = LiquiditySwapStatus.FAILED;
                swap.outcome = LiquiditySwapOutcome.FAILED;
                swap.errorMessage = error instanceof Error ? error.message : String(error);
                swap.completedAt = new Date();
                await this.swapRepository.save(swap);
            }

            this.logger.error(`[swap:${swapId}] Swap failed with exception:`, error);
        }
    }
}
