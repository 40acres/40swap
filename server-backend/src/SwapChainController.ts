import { BadRequestException, Body, Controller, Post, UsePipes } from '@nestjs/common';
import { IntiateSwapFromLNToLQResponse, swapChainRequestSchema } from '@40swap/shared';
import { createZodDto, ZodValidationPipe } from '@anatine/zod-nestjs';
import { ApiCreatedResponse } from '@nestjs/swagger';
import { SwapService } from './SwapService.js';

class SwapChainRequestDto extends createZodDto(swapChainRequestSchema) { }

@Controller('/swap/chain')
@UsePipes(ZodValidationPipe)
export class SwapChainController {

    constructor(
        private swapService: SwapService,
    ) {}

    @Post('/ln-to-liq')
    @ApiCreatedResponse({ description: 'Create a swap between chains', type: undefined })
    async createSwap(@Body() request: SwapChainRequestDto): Promise<IntiateSwapFromLNToLQResponse> {
        if (request.originChain !== 'LIGHTNING' || request.destinationChain !== 'LIQUID') {
            throw new BadRequestException('We only support swaps from LIGHTNING to LIQUID currently');
        }
        return await this.swapService.initiateLightningToLiquidSwap(request);
    }
}