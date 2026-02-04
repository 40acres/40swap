import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChannelsService } from './ChannelsService.js';
import { BitfinexSwapStrategy, SwapResult } from './BitfinexSwapStrategy.js';
import { LiquiditySwap, LiquiditySwapStatus, LiquiditySwapOutcome } from './entities/LiquiditySwap.js';
import Decimal from 'decimal.js';
import * as crypto from 'crypto';

export interface SwapRequest {
    channelId: string;
    amountSats: number;
}

@Injectable()
export class SwapService {
    private readonly logger = new Logger(SwapService.name);

    constructor(
        private readonly channelsService: ChannelsService,
        private readonly bitfinexStrategy: BitfinexSwapStrategy,
        @InjectRepository(LiquiditySwap)
        private readonly swapRepository: Repository<LiquiditySwap>,
    ) {}

    async executeSwap(request: SwapRequest): Promise<SwapResult> {
        this.logger.log(`Executing swap for channel ${request.channelId}, amount: ${request.amountSats} sats`);

        const channel = await this.channelsService.getChannelById(request.channelId);
        if (!channel) {
            throw new BadRequestException(`Channel ${request.channelId} not found`);
        }

        const localBalance = parseInt(channel.localBalance, 10);
        if (request.amountSats > localBalance) {
            throw new BadRequestException(`Insufficient balance. Channel has ${localBalance} sats, requested ${request.amountSats} sats`);
        }

        if (request.amountSats <= 0) {
            throw new BadRequestException('Amount must be positive');
        }

        // Create swap record in database
        const swapId = crypto.randomBytes(16).toString('hex');
        const swap = this.swapRepository.create({
            id: swapId,
            channelId: request.channelId,
            peerAlias: channel.peerAlias,
            remotePubkey: channel.remotePubkey,
            amountSats: new Decimal(request.amountSats),
            status: LiquiditySwapStatus.PENDING,
        });

        await this.swapRepository.save(swap);
        this.logger.log(`Created swap record with ID: ${swapId}`);

        try {
            // Execute the swap
            const result = await this.bitfinexStrategy.swapOut(request.channelId, request.amountSats);

            if (result.success) {
                // Calculate cost (we'll update this with actual routing fees if available)
                const estimatedCostSats = new Decimal(request.amountSats).mul(0.001); // Estimate 0.1% cost

                // Update swap record with success
                swap.status = LiquiditySwapStatus.COMPLETED;
                swap.outcome = LiquiditySwapOutcome.SUCCESS;
                swap.bitfinexTxId = result.txid || null;
                swap.liquidAddress = result.liquidAddress || null;
                swap.costSats = estimatedCostSats;
                swap.completedAt = new Date();
                await this.swapRepository.save(swap);

                this.logger.log(`Swap ${swapId} completed successfully`);
            } else {
                // Update swap record with failure
                swap.status = LiquiditySwapStatus.FAILED;
                swap.outcome = LiquiditySwapOutcome.FAILED;
                swap.errorMessage = result.error || null;
                swap.completedAt = new Date();
                await this.swapRepository.save(swap);

                this.logger.error(`Swap ${swapId} failed: ${result.error}`);
            }

            return result;
        } catch (error) {
            // Update swap record with error
            swap.status = LiquiditySwapStatus.FAILED;
            swap.outcome = LiquiditySwapOutcome.FAILED;
            swap.errorMessage = error instanceof Error ? error.message : String(error);
            swap.completedAt = new Date();
            await this.swapRepository.save(swap);

            this.logger.error(`Swap ${swapId} failed with exception:`, error);
            throw error;
        }
    }
}
