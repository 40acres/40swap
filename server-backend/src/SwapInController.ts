import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query, UsePipes } from '@nestjs/common';
import { createZodDto, ZodValidationPipe } from '@anatine/zod-nestjs';
import assert from 'node:assert';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import { address, Psbt, Transaction } from 'bitcoinjs-lib';
import { NbxplorerService } from './NbxplorerService.js';
import { DataSource } from 'typeorm';
import { SwapIn } from './entities/SwapIn.js';
import { LndService } from './LndService.js';
import { buildContractSpendBasePsbt, buildTransactionWithFee } from './bitcoin-utils.js';
import { BitcoinConfigurationDetails, BitcoinService } from './BitcoinService.js';
import { SwapService } from './SwapService.js';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { 
    GetSwapInResponse,
    getSwapInResponseSchema,
    PsbtResponse,
    psbtResponseSchema, 
    signContractSpend,
    swapInRequestSchema,
    txRequestSchema,
} from '@40swap/shared';

const ECPair = ECPairFactory(ecc);

class SwapInRequestDto extends createZodDto(swapInRequestSchema) {}
class TxRequestDto extends createZodDto(txRequestSchema) {}
class GetSwapInResponseDto extends createZodDto(getSwapInResponseSchema) {}
class PsbtResponseDto extends createZodDto(psbtResponseSchema) {}

@Controller('/swap/in')
@UsePipes(ZodValidationPipe)
export class SwapInController {
    constructor(
        private lnd: LndService,
        private nbxplorer: NbxplorerService,
        private dataSource: DataSource,
        private bitcoinConfig: BitcoinConfigurationDetails,
        private bitcoinService: BitcoinService,
        private swapService: SwapService,
    ) {}

    @Post()
    @ApiCreatedResponse({description: 'Create a swap in', type: GetSwapInResponseDto})
    async createSwap(@Body() request: SwapInRequestDto): Promise<GetSwapInResponse> {
        const swap = await this.swapService.createSwapIn(request);
        return this.mapToResponse(swap);
    }

    @Get('/:id/refund-psbt')
    @ApiOkResponse({description: 'Get a refund PSBT', type: PsbtResponseDto})
    async getRefundPsbt(@Param('id') id: string, @Query('address') outputAddress?: string): Promise<PsbtResponse> {
        if (outputAddress == null) {
            throw new BadRequestException('address is required');
        }
        try {
            address.toOutputScript(outputAddress, this.bitcoinConfig.network);
        } catch (e) {
            throw new BadRequestException(`invalid address ${outputAddress}`);
        }
        const swap = await this.dataSource.getRepository(SwapIn).findOneBy({ id });
        if (swap === null) {
            throw new NotFoundException('swap not found');
        }
        assert(swap.lockTx != null);
        const lockTx = Transaction.fromBuffer(swap.lockTx);
        const refundPsbt = this.buildRefundPsbt(swap, lockTx, outputAddress, await this.bitcoinService.getMinerFeeRate('low_prio'));
        return { psbt: refundPsbt.toBase64() };
    }

    @Post('/:id/refund-tx')
    @ApiCreatedResponse({description: 'Send a refund tx', type: undefined})
    async sendRefundTx(@Param('id') id: string, @Body() txRequest: TxRequestDto): Promise<void> {
        const swap = await this.dataSource.getRepository(SwapIn).findOneBy({ id });
        if (swap === null) {
            throw new NotFoundException('swap not found');
        }
        assert(swap.lockTx != null);
        try {
            const lockTx = Transaction.fromBuffer(swap.lockTx);
            const refundTx = Transaction.fromHex(txRequest.tx);
            if (refundTx.ins.filter(i => i.hash.equals(lockTx.getHash())).length !== 1) {
                throw new BadRequestException('invalid refund tx');
            }
            await this.nbxplorer.broadcastTx(refundTx);
        } catch (e) {
            throw new BadRequestException('invalid bitcoin tx');
        }
    }

    @Get('/:id')
    @ApiOkResponse({description: 'Get a swap', type: GetSwapInResponseDto})
    async getSwap(@Param('id') id: string): Promise<GetSwapInResponse> {
        const swap = await this.dataSource.getRepository(SwapIn).findOneBy({ id });
        if (swap === null) {
            throw new NotFoundException('swap not found');
        }
        return this.mapToResponse(swap);
    }

    private mapToResponse(swap: SwapIn): GetSwapInResponse {
        return {
            swapId: swap.id,
            chain: swap.chain,
            contractAddress: swap.contractAddress,
            redeemScript: swap.lockScript.toString('hex'),
            timeoutBlockHeight: swap.timeoutBlockHeight,
            status: swap.status,
            inputAmount: swap.inputAmount.toNumber(),
            createdAt: swap.createdAt.toISOString(),
            outputAmount: swap.outputAmount.toNumber(),
            lockTx: swap.lockTx?.toString('hex'),
            outcome: swap.outcome ?? undefined,
        };
    }

    buildRefundPsbt(swap: SwapIn, spendingTx: Transaction, outputAddress: string, feeRate: number): Psbt {
        const { network } = this.bitcoinConfig;
        return buildTransactionWithFee(
            feeRate,
            (feeAmount, isFeeCalculationRun) => {
                const psbt = buildContractSpendBasePsbt({
                    contractAddress: swap.contractAddress,
                    lockScript: swap.lockScript,
                    network,
                    spendingTx,
                    outputAddress,
                    feeAmount,
                });
                psbt.locktime = swap.timeoutBlockHeight;
                if (isFeeCalculationRun) {
                    signContractSpend({
                        psbt,
                        network,
                        key: ECPair.fromPrivateKey(swap.unlockPrivKey),
                        preImage: Buffer.alloc(0),
                    });
                }
                return psbt;
            }
        );
    }
}
