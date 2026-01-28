import { NbxplorerService } from './NbxplorerService.js';
import { DataSource } from 'typeorm';
import { createZodDto } from '@anatine/zod-nestjs';
import { BadRequestException, Body, Controller, Get, Logger, Param, Post, Query, NotFoundException, ParseIntPipe } from '@nestjs/common';
import { buildContractSpendBasePsbt, buildTransactionWithFee } from './bitcoin-utils.js';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import { address, Psbt, Transaction } from 'bitcoinjs-lib';
import * as liquid from 'liquidjs-lib';
import assert from 'node:assert';
import { SwapOut } from './entities/SwapOut.js';
import { BitcoinConfigurationDetails, BitcoinService } from './BitcoinService.js';
import { SwapService } from './SwapService.js';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import {
    GetSwapOutResponse,
    getSwapOutResponseSchema,
    PsbtResponse,
    psbtResponseSchema,
    signContractSpend,
    swapOutRequestSchema,
    txRequestSchema,
    getLiquidNetworkFromBitcoinNetwork,
} from '@40swap/shared';
import { LiquidClaimPSETBuilder } from './LiquidUtils.js';
import { LiquidService } from './LiquidService.js';
const ECPair = ECPairFactory(ecc);

class SwapOutRequestDto extends createZodDto(swapOutRequestSchema) {}
class TxRequestDto extends createZodDto(txRequestSchema) {}
class GetSwapOutResponseDto extends createZodDto(getSwapOutResponseSchema) {}
class PsbtResponseDto extends createZodDto(psbtResponseSchema) {}

@Controller('/swap/out')
export class SwapOutController {
    private readonly logger = new Logger(SwapOutController.name);

    constructor(
        private nbxplorer: NbxplorerService,
        private dataSource: DataSource,
        private bitcoinConfig: BitcoinConfigurationDetails,
        private bitcoinService: BitcoinService,
        private liquidService: LiquidService,
        private swapService: SwapService,
    ) {}

    @Post()
    @ApiOperation({ description: 'Creates a swap-out (lightning to chain)' })
    @ApiCreatedResponse({ description: 'The swap-out was correctly created', type: GetSwapOutResponseDto })
    async createSwap(@Body() request: SwapOutRequestDto): Promise<GetSwapOutResponse> {
        const swap = await this.swapService.createSwapOut(request);
        return this.mapToResponse(swap);
    }

    @Get('/:id')
    @ApiOperation({ description: 'Gets current status of a swap-out.' })
    @ApiParam({ name: 'id', required: true, description: 'The swap-out ID.' })
    @ApiOkResponse({ type: GetSwapOutResponseDto })
    async getSwap(@Param('id') id: string): Promise<GetSwapOutResponse> {
        const swap = await this.dataSource.getRepository(SwapOut).findOneBy({ id });
        if (swap === null) {
            throw new NotFoundException('swap not found');
        }
        return this.mapToResponse(swap);
    }

    @Post('/:id/claim')
    @ApiOperation({ description: 'Broadcasts a claim transaction.' })
    @ApiParam({ name: 'id', required: true, description: 'The swap-out ID to claim.' })
    @ApiCreatedResponse({ description: 'The tx was broadcast' })
    async claimSwap(@Body() txRequest: TxRequestDto, @Param('id') id: string): Promise<void> {
        const swap = await this.dataSource.getRepository(SwapOut).findOneBy({ id });
        if (swap === null) {
            throw new NotFoundException('swap not found');
        }
        assert(swap.lockTx != null);
        if (swap.chain === 'BITCOIN') {
            try {
                const lockTx = Transaction.fromBuffer(swap.lockTx);
                const claimTx = Transaction.fromHex(txRequest.tx);
                if (claimTx.ins.filter((i) => i.hash.equals(lockTx.getHash())).length !== 1) {
                    throw new BadRequestException('invalid claim tx');
                }
                await this.nbxplorer.broadcastTx(claimTx);
            } catch (e) {
                throw new BadRequestException('invalid bitcoin tx');
            }
        } else if (swap.chain === 'LIQUID') {
            try {
                const lockTx = liquid.Transaction.fromBuffer(swap.lockTx);
                const claimTx = liquid.Transaction.fromHex(txRequest.tx);
                if (claimTx.ins.filter((i) => i.hash.equals(lockTx.getHash())).length !== 1) {
                    throw new BadRequestException('invalid claim tx');
                }
                await this.nbxplorer.broadcastTx(claimTx, 'lbtc');
            } catch (e) {
                throw new BadRequestException('invalid liquid tx');
            }
        }
    }

    @Get('/:id/claim-psbt')
    @ApiOperation({ description: 'Obtains an unsigned PSBT to claim the swap-out.' })
    @ApiQuery({ name: 'address', required: true, description: 'The address to claim to.' })
    @ApiParam({ name: 'id', required: true, description: 'The swap-out ID to claim.' })
    @ApiOkResponse({ type: PsbtResponseDto })
    async getClaimPsbt(
        @Param('id') id: string,
        @Query('address') outputAddress?: string,
        @Query('fee_rate', new ParseIntPipe({ optional: true })) feeRate?: number,
    ): Promise<PsbtResponse> {
        if (outputAddress == null) {
            throw new BadRequestException('address is required');
        }
        if (feeRate != null && feeRate < 1) {
            throw new BadRequestException('invalid fee rate');
        }
        const swap = await this.dataSource.getRepository(SwapOut).findOneBy({ id });
        if (swap === null) {
            throw new NotFoundException('swap not found');
        }
        assert(swap.lockTx != null, 'Swap does not have lock tx');
        if (swap.chain === 'BITCOIN') {
            try {
                address.toOutputScript(outputAddress, this.bitcoinConfig.network);
            } catch (e) {
                throw new BadRequestException(`invalid address ${outputAddress}`);
            }
            const lockTx = Transaction.fromBuffer(swap.lockTx);
            const claimPsbt = this.buildClaimPsbt(swap, lockTx, outputAddress, feeRate ?? (await this.bitcoinService.getMinerFeeRate('low_prio')));
            return { psbt: claimPsbt.toBase64() };
        }
        if (swap.chain === 'LIQUID') {
            assert(swap.status === 'CONTRACT_FUNDED', 'swap is not ready');
            try {
                liquid.address.toOutputScript(outputAddress, getLiquidNetworkFromBitcoinNetwork(this.bitcoinConfig.network));
            } catch (e) {
                throw new BadRequestException(`invalid address ${outputAddress}`);
            }
            const pset = await this.buildLiquidClaimPset(swap, outputAddress);
            return { psbt: pset.toBase64() };
        }
        throw new BadRequestException('invalid chain');
    }

    buildClaimPsbt(swap: SwapOut, spendingTx: Transaction, outputAddress: string, feeRate: number): Psbt {
        const { network } = this.bitcoinConfig;
        return buildTransactionWithFee(feeRate, (feeAmount, isFeeCalculationRun) => {
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
        });
    }

    async buildLiquidClaimPset(swap: SwapOut, destinationAddress: string): Promise<liquid.Pset> {
        assert(this.liquidService.xpub != null, 'liquid is not available');
        assert(this.liquidService.configurationDetails != null, 'liquid is not available');
        const liquidNetwork = getLiquidNetworkFromBitcoinNetwork(this.bitcoinConfig.network);
        const psetBuilder = new LiquidClaimPSETBuilder(this.nbxplorer, this.liquidService, liquidNetwork);
        const lockTx = liquid.Transaction.fromBuffer(swap.lockTx!);
        return await psetBuilder.getPset(swap, lockTx, destinationAddress);
    }

    private mapToResponse(swap: SwapOut): GetSwapOutResponse {
        return {
            swapId: swap.id,
            chain: swap.chain,
            timeoutBlockHeight: swap.timeoutBlockHeight,
            redeemScript: swap.lockScript?.toString('hex'),
            invoice: swap.invoice,
            contractAddress: swap.contractAddress ?? undefined,
            refundPublicKey: ECPair.fromPrivateKey(swap.unlockPrivKey).publicKey.toString('hex'),
            outputAmount: swap.outputAmount.toNumber(),
            status: swap.status,
            lockTx: swap.lockTx?.toString('hex'),
            createdAt: swap.createdAt.toISOString(),
            inputAmount: swap.inputAmount.toNumber(),
            outcome: swap.outcome ?? undefined,
        };
    }
}
