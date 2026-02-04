import { Controller, Logger, Post, UsePipes } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SwapService } from './SwapService.js';
import { SwapResult } from './BitfinexSwapStrategy.js';
import { z } from 'zod';
import { createZodDto, ZodValidationPipe } from '@anatine/zod-nestjs';

const SwapRequestSchema = z.object({
    channelId: z.string().min(1),
    amountSats: z.number().int().positive(),
});

class SwapRequestDto extends createZodDto(SwapRequestSchema) {}

@ApiTags('swap')
@Controller('swap')
@UsePipes(ZodValidationPipe)
export class SwapController {
    private readonly logger = new Logger(SwapController.name);

    constructor(private readonly swapService: SwapService) {}

    @Post()
    @ApiOperation({ summary: 'Execute a swap to move balance out of a channel' })
    @ApiResponse({ status: 200, description: 'Swap executed successfully' })
    @ApiResponse({ status: 400, description: 'Invalid request or insufficient balance' })
    async executeSwap(request: SwapRequestDto): Promise<SwapResult> {
        this.logger.log('POST /swap');
        return this.swapService.executeSwap(request);
    }
}
