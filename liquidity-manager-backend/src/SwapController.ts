import { Body, Controller, Get, Logger, Post, UsePipes } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SwapInitiateResponse, SwapService } from './SwapService.js';
import { z } from 'zod';
import { createZodDto, ZodValidationPipe } from '@anatine/zod-nestjs';
import Decimal from 'decimal.js';

const SwapRequestSchema = z.object({
    channelId: z.string().min(1),
    amount: z
        .string()
        .transform((n) => new Decimal(n))
        .refine((n) => n.gt(0), { message: 'Amount must be positive' }),
    strategy: z.string().optional(),
});

class SwapRequestDto extends createZodDto(SwapRequestSchema) {}

@ApiTags('swap')
@Controller('swap')
@UsePipes(ZodValidationPipe)
export class SwapController {
    private readonly logger = new Logger(SwapController.name);

    constructor(private readonly swapService: SwapService) {}

    @Get('strategies')
    @ApiOperation({ summary: 'Get available swap strategies' })
    @ApiResponse({ status: 200, description: 'List of available strategies' })
    getStrategies(): { strategies: string[] } {
        this.logger.log('GET /swap/strategies');
        return {
            strategies: this.swapService.getAvailableStrategies(),
        };
    }

    @Post()
    @ApiOperation({ summary: 'Initiate a swap to move balance out of a channel (returns immediately, swap runs in background)' })
    @ApiResponse({ status: 200, description: 'Swap initiated successfully' })
    @ApiResponse({ status: 400, description: 'Invalid request or insufficient balance' })
    async initiateSwap(@Body() request: SwapRequestDto): Promise<SwapInitiateResponse> {
        this.logger.log('POST /swap');
        return this.swapService.initiateSwap(request);
    }
}
