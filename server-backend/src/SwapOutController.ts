import { NbxplorerService } from './NbxplorerService.js';
import { DataSource } from 'typeorm';
import { createZodDto } from '@anatine/zod-nestjs';
import { BadRequestException, Body, Controller, Get, Logger, Param, Post, Query, NotFoundException } from '@nestjs/common';
import { buildContractSpendBasePsbt, buildTransactionWithFee } from './bitcoin-utils.js';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import { address, Psbt, Transaction } from 'bitcoinjs-lib';
import * as liquid from 'liquidjs-lib';
import assert from 'node:assert';
import { SwapOut } from './entities/SwapOut.js';
import { BitcoinConfigurationDetails, BitcoinService } from './BitcoinService.js';
import { SwapService } from './SwapService.js';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { liquid as liquidNetwork, regtest as liquidRegtest } from 'liquidjs-lib/src/networks.js';

import {
    GetSwapOutResponse,
    PsbtResponse,
    psbtResponseSchema,
    signContractSpend,
    swapOutRequestSchema,
    txRequestSchema,
} from '@40swap/shared';
import { bitcoin } from 'bitcoinjs-lib/src/networks.js';


const ECPair = ECPairFactory(ecc);

class SwapOutRequestDto extends createZodDto(swapOutRequestSchema) {}
class TxRequestDto extends createZodDto(txRequestSchema) {}
class GetSwapOutResponseDto extends createZodDto(swapOutRequestSchema) {}
class PsbtResponseDto extends createZodDto(psbtResponseSchema) {}

@Controller('/swap/out')
export class SwapOutController {
    private readonly logger = new Logger(SwapOutController.name);
    
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
        const swap = await this.swapService.createSwapOut(request);
        return this.mapToResponse(swap);
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

    // TODO: remove this, only for testing
    @Post('/claim/liquid/signed')
    @ApiCreatedResponse({description: 'Claim a swap out'})
    async getLiquidClaimTX(@Body() txRequest: TxRequestDto, @Query('privKey') privKey: string, @Query('preimage') preimage: string): Promise<{ tx: string }> {
        const pset = liquid.Pset.fromBase64(txRequest.tx);
        const inputIndex = 0;
        const input = pset.inputs[inputIndex];
        if (!input.witnessScript) {
            throw new Error('El input no tiene witnessScript');
        }
        const preimageBuffer = Buffer.from(preimage, 'hex');
        const keyPair = ECPair.fromWIF(privKey, liquidRegtest);
        const sighashType = liquid.Transaction.SIGHASH_ALL;
        const signature = liquid.script.signature.encode(
            keyPair.sign(pset.getInputPreimage(inputIndex, sighashType)),
            sighashType,
        );
        const signer = new liquid.Signer(pset);
        signer.addSignature(
            inputIndex,
            {
                partialSig: {
                    pubkey: keyPair.publicKey,
                    signature,
                },
            },
            liquid.Pset.ECDSASigValidator(ecc),
        );
        const finalizer = new liquid.Finalizer(pset);
        const stack = [signature,preimageBuffer,input.witnessScript!];
        finalizer.finalizeInput(inputIndex, () => {
            return {finalScriptWitness: liquid.witnessStackToScriptWitness(stack)};
        });
        const transaction = liquid.Extractor.extract(pset);
        return { tx: transaction.toHex() };
    }

    @Post('/:id/claim/liquid')
    @ApiCreatedResponse({description: 'Claim a swap out'})
    async posttLiquidClaimTX(@Body() txRequest: TxRequestDto, @Param('id') id: string): Promise<void> {
        const swap = await this.dataSource.getRepository(SwapOut).findOneByOrFail({ id });
        assert(swap.lockTx != null);
        try {
            const lockTx = liquid.Transaction.fromBuffer(swap.lockTx);
            const claimTx = liquid.Transaction.fromHex(txRequest.tx);
            if (claimTx.ins.filter(i => i.hash.equals(lockTx.getHash())).length !== 1) {
                throw new BadRequestException('invalid claim tx');
            }
            await this.nbxplorer.broadcastTx(claimTx, 'lbtc');
        } catch (e) {
            throw new BadRequestException('invalid liquid tx');
        }
    }

    @Get('/:id/claim/liquid')
    @ApiOkResponse({description: 'Get a claim PSBT for a liquid swap out', type: PsbtResponseDto})
    async getLiquidClaimPset(@Param('id') id: string, @Query('address') outputAddress?: string): Promise<PsbtResponse> {
        if (outputAddress == null) {
            throw new BadRequestException('address is required');
        }
        try {
            const network = this.bitcoinConfig.network === bitcoin ? liquidNetwork : liquidRegtest;
            liquid.address.toOutputScript(outputAddress, network);
        } catch (e) {
            throw new BadRequestException(`invalid address ${outputAddress}`);
        }
        const swap = await this.dataSource.getRepository(SwapOut).findOneByOrFail({ id });
        assert(swap.lockTx != null, 'swap lockTx is null');
        if (swap.status === 'CONTRACT_CLAIMED_UNCONFIRMED') {
            throw new BadRequestException('swap is already being claimed');
        }
        assert(swap.status === 'CONTRACT_FUNDED', 'swap is not ready');
        const pset = await this.swapService.buildLiquidClaimPset(swap, outputAddress);
        return { psbt: pset.toBase64() };
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