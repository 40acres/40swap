import { BadRequestException, Body, Controller, Get, Logger, Param, Post, Query, UsePipes } from '@nestjs/common';
import { createZodDto, ZodValidationPipe } from '@anatine/zod-nestjs';
import { decode } from '@boltz/bolt11';
import assert from 'node:assert';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import { address, payments, Psbt, Transaction } from 'bitcoinjs-lib';
import { NBXplorerBlockEvent, NBXplorerNewTransactionEvent, NbxplorerService } from './NbxplorerService.js';
import { OnEvent } from '@nestjs/event-emitter';
import { DataSource, In, LessThanOrEqual } from 'typeorm';
import { SwapIn } from './entities/SwapIn.js';
import Decimal from 'decimal.js';
import { LndService } from './LndService.js';
import { buildContractSpendBasePsbt, buildTransactionWithFee, swapScript } from './bitcoin-utils.js';
import {
    GetSwapInResponse,
    PsbtResponse,
    signContractSpend,
    swapInRequestSchema,
    txRequestSchema,
} from '@40swap/shared';
import { BitcoinConfigurationDetails, BitcoinService } from './BitcoinService.js';

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
    ) {}

    @Post()
    async createSwap(@Body() request: SwapInRequestDto): Promise<GetSwapInResponse> {
        const { network } = this.bitcoinConfig;
        const { tags, satoshis } = decode(request.invoice, { bech32: network.bech32 } );
        const hashTag = tags.find(t => t.tagName === 'payment_hash');
        assert(hashTag);
        assert(typeof hashTag.data === 'string');
        assert(satoshis != null);
        const paymentHash = hashTag.data;

        const timeoutBlockHeight = (await this.bitcoinService.getBlockHeight()) + this.bitcoinConfig.swapLockBlockDelta;
        const claimKey = ECPair.makeRandom();
        const lockScript = swapScript(
            Buffer.from(paymentHash, 'hex'),
            Buffer.from(claimKey.publicKey),
            Buffer.from(request.refundPublicKey, 'hex'),
            timeoutBlockHeight,
        );
        const { address } = payments.p2wsh({network, redeem: { output: lockScript, network }});
        assert(address);
        await this.nbxplorer.trackAddress(address);

        const swap = await this.dataSource.getRepository(SwapIn).save({
            contractAddress: address,
            invoice: request.invoice,
            lockScript,
            privKey: claimKey.privateKey!,
            inputAmount: new Decimal(satoshis).div(1e8).toDecimalPlaces(8),
            outputAmount: new Decimal(satoshis).div(1e8).toDecimalPlaces(8),
            status: 'CREATED',
            sweepAddress: await this.lnd.getNewAddress(),
            timeoutBlockHeight,
        });

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
            address: swap.contractAddress,
            redeemScript: swap.lockScript.toString('hex'),
            timeoutBlockHeight: swap.timeoutBlockHeight,
            status: swap.status,
            inputAmount: swap.inputAmount.toNumber(),
        };
    }

    buildClaimTx(swap: SwapIn, spendingTx: Transaction, feeRate: number): Transaction {
        const { network } = this.bitcoinConfig;
        return buildTransactionWithFee(
            feeRate,
            (feeAmount, isFeeCalculationRun) => {
                const psbt = buildContractSpendBasePsbt({
                    swap,
                    network,
                    spendingTx,
                    outputAddress: swap.sweepAddress,
                    feeAmount,
                });
                signContractSpend({
                    psbt,
                    key: ECPair.fromPrivateKey(swap.privKey),
                    network: this.bitcoinConfig.network,
                    preImage: swap.preImage!,
                });
                return psbt;
            },
        ).extractTransaction();
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
                        key: ECPair.fromPrivateKey(swap.privKey),
                        preImage: Buffer.alloc(0),
                    });
                }
                return psbt;
            }
        );
    }

    @OnEvent('nbxplorer.newtransaction')
    private async processNewTransaction(event: NBXplorerNewTransactionEvent): Promise<void> {
        const addressRegex = /ADDRESS:(.*)/;
        const match = event.data.trackedSource.match(addressRegex);
        if (match != null) {
            const swapInRepository = this.dataSource.getRepository(SwapIn);
            const txAddress = match[1];
            const swap = await swapInRepository.findOneBy({
                status: In(['CREATED', 'CONTRACT_EXPIRED']),
                contractAddress: txAddress,
            });
            if (swap == null) {
                // TODO log
                return;
            }
            if (swap.status === 'CREATED') {
                await this.processContractFundingTx(swap, event);
            } else if (swap.status === 'CONTRACT_EXPIRED') {
                await this.processContractSpendingTx(swap, event);
            }
        }
    }

    private async processContractFundingTx(swap: SwapIn, event: NBXplorerNewTransactionEvent): Promise<void> {
        const swapInRepository = this.dataSource.getRepository(SwapIn);
        // TODO: the output is also found by buildClaimTx(), needs refactor
        const output = event.data.outputs.find(o => o.address === swap.contractAddress);
        assert(output != null);
        const expectedAmount = new Decimal(output.value).div(1e8);
        if (!expectedAmount.equals(swap.outputAmount)) {
            this.logger.error(`amount mismatch. Failed swap. Incoming ${expectedAmount.toNumber()}, expected ${swap.outputAmount.toNumber()}`);
            return;
        }
        swap.status = 'CONTRACT_FUNDED';
        swap.inputAmount = new Decimal(output.value).div(1e8).toDecimalPlaces(8);
        swap.lockTx = Buffer.from(event.data.transactionData.transaction, 'hex');
        await swapInRepository.save(swap);

        swap.preImage = await this.lnd.sendPayment(swap.invoice);
        swap.status = 'INVOICE_PAID';
        await swapInRepository.save(swap);

        const claimTx = this.buildClaimTx(
            swap,
            Transaction.fromHex(event.data.transactionData.transaction),
            await this.bitcoinService.getMinerFeeRate('low_prio'),
        );
        await this.nbxplorer.broadcastTx(claimTx);
        swap.status = 'CLAIMED';
        await swapInRepository.save(swap);
    }

    private async processContractSpendingTx(swap: SwapIn, event: NBXplorerNewTransactionEvent): Promise<void> {
        const swapInRepository = this.dataSource.getRepository(SwapIn);
        assert(swap.lockTx != null);

        const tx = Transaction.fromHex(event.data.transactionData.transaction);
        const isPayingToExternalAddress = event.data.outputs.length === 0; // nbxplorer does not list outputs if it's spending a tracking utxo
        const isSpendingFromContract = tx.ins.find(i => i.hash.equals(Transaction.fromBuffer(swap.lockTx!).getHash())) != null;
        const isPayingToSweepAddress = tx.outs.find(o => {
            try {
                return address.fromOutputScript(o.script) === swap.sweepAddress;
            } catch (e) {
                return false;
            }
        }) != null;

        if (isSpendingFromContract && isPayingToExternalAddress && !isPayingToSweepAddress) {
            console.log('refund found');
            swap.status = 'REFUNDED';
            await swapInRepository.save(swap);
        }
    }

    @OnEvent('nbxplorer.newblock')
    private async processNewBlock(event: NBXplorerBlockEvent): Promise<void> {
        const swapInRepository = this.dataSource.getRepository(SwapIn);
        const expiredSwaps = await swapInRepository.findBy({
            status: 'CONTRACT_FUNDED',
            timeoutBlockHeight: LessThanOrEqual(event.data.height!),
        });
        for (const swap of expiredSwaps) {
            this.logger.log(`swap expired ${swap.id}`);
            swap.status = 'CONTRACT_EXPIRED';
            await swapInRepository.save(swap);
        }
    }
}
