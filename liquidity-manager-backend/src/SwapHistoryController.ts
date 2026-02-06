import { Controller, Get, Param, Logger } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SwapHistoryService } from './SwapHistoryService.js';
import { LiquiditySwap } from './entities/LiquiditySwap.js';

@ApiTags('swap-history')
@Controller('swap-history')
export class SwapHistoryController {
    private readonly logger = new Logger(SwapHistoryController.name);

    constructor(private readonly swapHistoryService: SwapHistoryService) {}

    @Get()
    @ApiOperation({ summary: 'Get all swap history' })
    @ApiResponse({ status: 200, description: 'List of all swaps' })
    async getAllSwaps(): Promise<LiquiditySwap[]> {
        this.logger.log('GET /swap-history');
        return this.swapHistoryService.getAllSwaps();
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get swap by ID' })
    @ApiResponse({ status: 200, description: 'Swap details' })
    @ApiResponse({ status: 404, description: 'Swap not found' })
    async getSwapById(@Param('id') id: string): Promise<LiquiditySwap | null> {
        this.logger.log(`GET /swap-history/${id}`);
        return this.swapHistoryService.getSwapById(id);
    }

    @Get('channel/:channelId')
    @ApiOperation({ summary: 'Get swaps by channel ID' })
    @ApiResponse({ status: 200, description: 'List of swaps for the channel' })
    async getSwapsByChannel(@Param('channelId') channelId: string): Promise<LiquiditySwap[]> {
        this.logger.log(`GET /swap-history/channel/${channelId}`);
        return this.swapHistoryService.getSwapsByChannel(channelId);
    }
}
