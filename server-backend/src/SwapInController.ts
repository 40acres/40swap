import { BadRequestException, Body, Controller, Get, Logger, Param, Post, Query, UsePipes } from '@nestjs/common';
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
import {
    GetSwapInResponse,
    PsbtResponse,
    signContractSpend,
    swapInRequestSchema,
    txRequestSchema,
} from '@40swap/shared';
import { BitcoinConfigurationDetails, BitcoinService } from './BitcoinService.js';
import { SwapService } from './SwapService.js';

const ECPair = ECPairFactory(ecc);

class SwapInRequestDto extends createZodDto(swapInRequestSchema) {}
class TxRequestDto extends createZodDto(txRequestSchema) {}

@Controller('/swap/in')
@UsePipes(ZodValidationPipe)
export class SwapInController {
    private readonly logger = new Logger(SwapInController.name);

    constructor(
        private lnd: LndService,
        private nbxplorer: NbxplorerService,
        private dataSource: DataSource,
        private bitcoinConfig: BitcoinConfigurationDetails,
        private bitcoinService: BitcoinService,
        private swapService: SwapService,
    ) {}

    @Post()
    async createSwap(@Body() request: SwapInRequestDto): Promise<GetSwapInResponse> {
        const swap = await this.swapService.createSwapIn(request);
        return this.mapToResponse(swap);
    }

    @Get('/:id/refund-psbt')
    async getRefundPsbt(@Param('id') id: string, @Query('address') outputAddress?: string): Promise<PsbtResponse> {
        if (outputAddress == null) {
            throw new BadRequestException('address is required');
        }
        try {
            address.toOutputScript(outputAddress, this.bitcoinConfig.network);
        } catch (e) {
            throw new BadRequestException(`invalid address ${outputAddress}`);
        }
        const swap = await this.dataSource.getRepository(SwapIn).findOneByOrFail({ id });
        assert(swap.lockTx != null);
        const lockTx = Transaction.fromBuffer(swap.lockTx);
        const refundPsbt = this.buildRefundPsbt(swap, lockTx, outputAddress, await this.bitcoinService.getMinerFeeRate('low_prio'));
        return { psbt: refundPsbt.toBase64() };
    }

    @Post('/:id/refund-tx')
    async sendRefundTx(@Param('id') id: string, @Body() txRequest: TxRequestDto): Promise<void> {
        try {
            // TODO validate
            const tx = Transaction.fromHex(txRequest.tx);
            await this.nbxplorer.broadcastTx(tx);
        } catch (e) {
            throw new BadRequestException('invalid bitcoin tx');
        }

    }

    @Get('/:id')
    async getSwap(@Param('id') id: string): Promise<GetSwapInResponse> {
        const swap = await this.dataSource.getRepository(SwapIn).findOneByOrFail({ id });
        return this.mapToResponse(swap);
    }

    private mapToResponse(swap: SwapIn): GetSwapInResponse {
        return {
            swapId: swap.id,
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
                    swap,
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
