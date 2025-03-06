import { BadRequestException, Body, Controller, Post, UsePipes } from '@nestjs/common';
import { GetSwapOutResponse, swapChainRequestSchema, swapOutRequestSchema } from '@40swap/shared';
import { createZodDto, ZodValidationPipe } from '@anatine/zod-nestjs';
import { ApiCreatedResponse } from '@nestjs/swagger';
import { SwapService } from './SwapService.js';
import { SwapOut } from './entities/SwapOut.js';

class SwapChainRequestDto extends createZodDto(swapChainRequestSchema) {}
class GetSwapOutResponseDto extends createZodDto(swapOutRequestSchema) {}

@Controller('/swap/chain')
@UsePipes(ZodValidationPipe)
export class SwapChainController {

    constructor(
        private swapService: SwapService,
    ) {}

    @Post('/ln-to-liq')
    @ApiCreatedResponse({ description: 'Create a swap between chains', type: GetSwapOutResponseDto })
    async createSwap(@Body() request: SwapChainRequestDto): Promise<GetSwapOutResponse> {
        if (request.originChain !== 'LIGHTNING' || request.destinationChain !== 'LIQUID') {
            throw new BadRequestException('We only support swaps from LIGHTNING to LIQUID currently');
        }
        const swap = await this.swapService.createSwapOutLightningToLiquidSwap(request);
        return this.mapToResponse(swap);
    }

    @Post('/test')
    @ApiCreatedResponse({ description: 'Create a swap between chains', type: GetSwapOutResponseDto })
    async test(): Promise<void> {
        await this.swapService.test();
    }

    private mapToResponse(swap: SwapOut): GetSwapOutResponse {
        return {
            swapId: swap.id,
            timeoutBlockHeight: swap.timeoutBlockHeight,
            redeemScript: swap.lockScript?.toString('hex'),
            invoice: swap.invoice,
            contractAddress: swap.contractAddress ?? undefined,
            outputAmount: swap.outputAmount.toNumber(),
            status: swap.status,
            lockTx: swap.lockTx?.toString('hex'),
            createdAt: swap.createdAt.toISOString(),
            inputAmount: swap.inputAmount.toNumber(),
            outcome: swap.outcome ?? undefined,
        };
    }
}