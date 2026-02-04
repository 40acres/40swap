import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ChannelsService } from './ChannelsService.js';
import { BitfinexSwapStrategy, SwapResult } from './BitfinexSwapStrategy.js';

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

        return this.bitfinexStrategy.swapOut(request.channelId, request.amountSats);
    }
}
