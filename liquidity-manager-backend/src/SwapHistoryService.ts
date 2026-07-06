import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LiquiditySwap } from './entities/LiquiditySwap.js';

@Injectable()
export class SwapHistoryService {
    private readonly logger = new Logger(SwapHistoryService.name);

    constructor(
        @InjectRepository(LiquiditySwap)
        private readonly swapRepository: Repository<LiquiditySwap>,
    ) {}

    async getAllSwaps(): Promise<LiquiditySwap[]> {
        this.logger.debug('Fetching all swaps');
        return this.swapRepository.find({
            order: {
                createdAt: 'DESC',
            },
        });
    }

    async getSwapById(id: string): Promise<LiquiditySwap | null> {
        this.logger.debug(`Fetching swap ${id}`);
        return this.swapRepository.findOne({
            where: { id },
        });
    }

    async getSwapsByChannel(channelId: string): Promise<LiquiditySwap[]> {
        this.logger.debug(`Fetching swaps for channel ${channelId}`);
        return this.swapRepository.find({
            where: { channelId },
            order: {
                createdAt: 'DESC',
            },
        });
    }
}
