import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChannelsService } from './ChannelsService.js';
import { LiquiditySwap } from './entities/LiquiditySwap.js';
import Decimal from 'decimal.js';
import * as crypto from 'crypto';
import { BitfinexLiquiditySwap } from './BitfinexLiquiditySwap.js';
import { LndService } from '@40swap/crypto-clients';
import { LiquidService } from './LiquidService.js';
import { BitfinexClient } from './BitfinexClient.js';
import { DummySwap } from './DummySwap.js';

export const STRATEGIES = ['bitfinex', 'dummy'] as const;
type Strategy = (typeof STRATEGIES)[number];

export interface SwapRequest {
    channelId: string;
    amount: Decimal;
    strategy: Strategy;
}

export interface SwapInitiateResponse {
    swapId: string;
    message: string;
}

export interface LiquiditySwapRunner {
    run(): Promise<void>;
}

@Injectable()
export class SwapService {
    private readonly logger = new Logger(SwapService.name);

    constructor(
        private readonly channelsService: ChannelsService,
        private readonly lndService: LndService,
        private readonly liquidService: LiquidService,
        private readonly bitfinex: BitfinexClient,
        @InjectRepository(LiquiditySwap)
        private readonly swapRepository: Repository<LiquiditySwap>,
    ) {}

    getAvailableStrategies(): ReadonlyArray<Strategy> {
        return STRATEGIES;
    }

    async initiateSwap({ strategy, amount, channelId }: SwapRequest): Promise<SwapInitiateResponse> {
        if (!strategy) {
            throw new BadRequestException(`Unknown strategy: ${strategy}. Available strategies: ${this.getAvailableStrategies().join(', ')}`);
        }

        const channel = await this.channelsService.getChannelById(channelId);
        if (!channel) {
            throw new BadRequestException(`Channel ${channelId} not found`);
        }

        const localBalance = parseInt(channel.localBalance, 10);
        if (amount.gt(localBalance)) {
            throw new BadRequestException(`Insufficient balance. Channel has ${localBalance} sats, requested ${amount} sats`);
        }

        if (amount.lte(0)) {
            throw new BadRequestException('Amount must be positive');
        }

        // Create swap record in database
        const swapId = crypto.randomBytes(16).toString('hex');
        this.logger.log(`[swap:${swapId}] Initiating swap - channel: ${channelId}, amount: ${amount} sats, strategy: ${strategy}`);

        const swap = this.swapRepository.create({
            id: swapId,
            channelId,
            peerAlias: channel.peerAlias,
            remotePubkey: channel.remotePubkey,
            amount,
            strategy,
            status: 'CREATED',
        });

        await this.swapRepository.save(swap);
        this.logger.log(`[swap:${swapId}] Swap record created in database`);

        // Execute swap in background (don't await)
        this.executeSwapInBackground(swapId, strategy);

        return {
            swapId,
            message: 'Swap initiated successfully. Check swap history for status updates.',
        };
    }

    private executeSwapInBackground(swapId: string, strategy: Strategy): void {
        let runner: LiquiditySwapRunner | undefined;
        switch (strategy) {
            case 'bitfinex':
                runner = new BitfinexLiquiditySwap(swapId, this.lndService, this.liquidService, this.bitfinex, this.swapRepository);
                break;
            case 'dummy':
                runner = new DummySwap(swapId, this.swapRepository);
                break;
            default:
                strategy satisfies never;
        }
        this.logger.log(`[swap:${swapId}] Starting background execution`);
        void runner!.run();
    }
}
