import { NbxplorerService } from './NbxplorerService.js';
import { DataSource } from 'typeorm';
import { createZodDto } from '@anatine/zod-nestjs';
import { BadRequestException, Body, Controller, Get, Param, Post, Query, NotFoundException } from '@nestjs/common';
import { buildContractSpendBasePsbt, buildTransactionWithFee } from './bitcoin-utils.js';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import { address, Psbt, Transaction } from 'bitcoinjs-lib';
import assert from 'node:assert';
import { SwapOut } from './entities/SwapOut.js';
import { BitcoinConfigurationDetails, BitcoinService } from './BitcoinService.js';
import { SwapService } from './SwapService.js';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import {
    GetSwapOutResponse,
    PsbtResponse,
    psbtResponseSchema,
    signContractSpend,
    swapOutRequestSchema,
    txRequestSchema,
} from '@40swap/shared';

const ECPair = ECPairFactory(ecc);

class SwapOutRequestDto extends createZodDto(swapOutRequestSchema) {}
class TxRequestDto extends createZodDto(txRequestSchema) {}
class GetSwapOutResponseDto extends createZodDto(swapOutRequestSchema) {}
class PsbtResponseDto extends createZodDto(psbtResponseSchema) {}

@Controller('/swap/out')
export class SwapOutController {
    constructor(
        private nbxplorer: NbxplorerService,
        private dataSource: DataSource,
        private bitcoinConfig: BitcoinConfigurationDetails,
        private bitcoinService: BitcoinService,
        private swapService: SwapService,
    ) {}

    @Post()
    @ApiCreatedResponse({description: 'Create a swap out', type: GetSwapOutResponseDto})
    async createSwap(@Body() request: SwapOutRequestDto): Promise<GetSwapOutResponse> {
        if (request.chain === 'BITCOIN') {
            const swap = await this.swapService.createSwapOut(request);
            return this.mapToResponse(swap);
        }
        if (request.chain === 'LIQUID') {
            const swap = await this.swapService.createLiquidSwapOut(request);
            return this.mapToResponse(swap);
        }
        throw new BadRequestException('Invalid chain');
    }


    @Get('/:id')
    @ApiOkResponse({description: 'Get a swap out', type: GetSwapOutResponseDto})
    async getSwap(@Param('id') id: string): Promise<GetSwapOutResponse> {
        const swap = await this.dataSource.getRepository(SwapOut).findOneBy({ id });
        if (swap === null) {
            throw new NotFoundException('swap not found');
        }
        return this.mapToResponse(swap);
    }

    @Post('/:id/claim')
    @ApiCreatedResponse({description: 'Claim a swap out'})
    async claimSwap(@Body() txRequest: TxRequestDto, @Param('id') id: string): Promise<void> {
        const swap = await this.dataSource.getRepository(SwapOut).findOneBy({ id });
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

    @Get('/:id/claim-psbt')
    @ApiOkResponse({description: 'Get a claim PSBT', type: PsbtResponseDto})
    async getClaimPsbt(@Param('id') id: string, @Query('address') outputAddress?: string): Promise<PsbtResponse> {
        if (outputAddress == null) {
            throw new BadRequestException('address is required');
        }
        try {
            address.toOutputScript(outputAddress, this.bitcoinConfig.network);
        } catch (e) {
            throw new BadRequestException(`invalid address ${outputAddress}`);
        }
        const swap = await this.dataSource.getRepository(SwapOut).findOneBy({ id });
        if (swap === null) {
            throw new NotFoundException('swap not found');
        }
        assert(swap.lockTx != null);
        const lockTx = Transaction.fromBuffer(swap.lockTx);
        const claimPsbt = this.buildClaimPsbt(swap, lockTx, outputAddress, await this.bitcoinService.getMinerFeeRate('low_prio'));
        return { psbt: claimPsbt.toBase64() };
    }

    buildClaimPsbt(swap: SwapOut, spendingTx: Transaction, outputAddress: string, feeRate: number): Psbt {
        const { network } = this.bitcoinConfig;
        return buildTransactionWithFee(
            feeRate,
            (feeAmount, isFeeCalculationRun) => {
                assert(swap.lockScript != null);
                assert(swap.contractAddress != null);
                const psbt = buildContractSpendBasePsbt({
                    contractAddress: swap.contractAddress,
                    lockScript: swap.lockScript,
                    network,
                    spendingTx,
                    outputAddress,
                    feeAmount,
                });
                if (isFeeCalculationRun) {
                    signContractSpend({
                        psbt,
                        network,
                        key: ECPair.fromPrivateKey(swap.unlockPrivKey),
                        preImage: Buffer.alloc(32).fill(0),
                    });
                }
                return psbt;
            },
        );
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