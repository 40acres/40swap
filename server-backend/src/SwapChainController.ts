import { BadRequestException, Body, Controller, Post, UsePipes } from '@nestjs/common';
import { createZodDto, ZodValidationPipe } from '@anatine/zod-nestjs';
import { ApiCreatedResponse } from '@nestjs/swagger';
import { swapChainRequestSchema } from '@40swap/shared';
import { SwapService } from './SwapService';

class SwapChainRequestDto extends createZodDto(swapChainRequestSchema) { }

@Controller('/swap/chain')
@UsePipes(ZodValidationPipe)
export class SwapChainController {

    constructor(
        private swapService: SwapService,
    ) {}

    @Post('/ln-to-liq')
    @ApiCreatedResponse({ description: 'Create a swap between chains', type: undefined })
    async createSwap(@Body() request: SwapChainRequestDto): Promise<string> {
        if (request.originChain !== 'LIGHTNING' || request.destinationChain !== 'LIQUID') {
            throw new BadRequestException('We only support swaps from LIGHTNING to LIQUID currently');
        }
        const swap = await this.swapService.initiateLightningToLiquidSwap(request.amount, request.destinationAddress);
        return swap;
    }
}