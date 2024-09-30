import { BadRequestException, Body, Controller, Get, Logger, Param, Post, Query, UsePipes } from '@nestjs/common';
import { createZodDto, ZodValidationPipe } from '@anatine/zod-nestjs';
import { decode } from '@boltz/bolt11';
import assert from 'node:assert';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import { address, payments, Psbt, script, Transaction } from 'bitcoinjs-lib';
import { witnessStackToScriptWitness } from 'bitcoinjs-lib/src/psbt/psbtutils.js';
import { NBXplorerBlockEvent, NBXplorerNewTransactionEvent, NbxplorerService } from './NbxplorerService.js';
import { OnEvent } from '@nestjs/event-emitter';
import { DataSource, LessThanOrEqual } from 'typeorm';
import { SwapIn } from './entities/SwapIn.js';
import Decimal from 'decimal.js';
import { LndService } from './LndService.js';
import { swapScript } from './contracts.js';
import { GetSwapInResponse, PsbtResponse, swapInRequestSchema } from '@40swap/shared';
import { BitcoinConfigurationDetails, BitcoinService } from './BitcoinService.js';

const ECPair = ECPairFactory(ecc);

class SwapInRequestDto extends createZodDto(swapInRequestSchema) {}

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
        const refundPsbt = this.buildRefundPsbt(swap, lockTx, outputAddress);
        return { psbt: refundPsbt.toBase64() };
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

    buildContractSpendBasePsbt(swap: SwapIn, spendingTx: Transaction, outputAddress: string): Psbt {
        const { network } = this.bitcoinConfig;

        const spendingOutput = spendingTx.outs
            .map((value, index) => ({ ...value, index }))
            .find(o => {
                try {
                    return address.fromOutputScript(o.script, network) === swap.contractAddress;
                } catch (e) {
                    return false;
                }
            });
        assert(spendingOutput != null);
        const expectedAmount = new Decimal(spendingOutput.value).div(1e8);
        if (!expectedAmount.equals(swap.outputAmount)) {
            throw new Error(`amount mismatch. Failed swap. Incoming ${expectedAmount.toNumber()}, expected ${swap.outputAmount.toNumber()}`);
        }

        const psbt = new Psbt({ network });
        psbt.addOutput({
            address: outputAddress,
            value: spendingOutput.value - 200, // TODO calculate fee
        });

        const p2wsh = payments.p2wsh({ redeem: { output: swap.lockScript, network }, network });
        psbt.addInput({
            hash: spendingTx.getHash(),
            index: spendingOutput.index,
            witnessScript: swap.lockScript,
            witnessUtxo: {
                script: p2wsh.output!,
                value: spendingOutput.value,
            },
            sequence: 0xfffffffd, // locktime does not work without this
        });
        return psbt;
    }

    buildClaimTx(swap: SwapIn, spendingTx: Transaction): Transaction {
        const { network } = this.bitcoinConfig;
        const psbt = this.buildContractSpendBasePsbt(swap, spendingTx, swap.sweepAddress);
        psbt.signInput(0, ECPair.fromPrivateKey(swap.privKey), [Transaction.SIGHASH_ALL]);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        psbt.finalizeInput(0, (inputIndex, input, arg2, isSegwit, isP2SH, isP2WSH): {
            finalScriptSig: Buffer | undefined;
            finalScriptWitness: Buffer | undefined;
        } => {
            assert(input.partialSig != null);
            const redeemPayment = payments.p2wsh({
                network,
                redeem: {
                    input: script.compile([
                        input.partialSig[0].signature,
                        swap.preImage!,
                    ]),
                    output: input.witnessScript,
                },
            });

            const finalScriptWitness = witnessStackToScriptWitness(
                redeemPayment.witness ?? []
            );

            return {
                finalScriptSig: Buffer.from(''),
                finalScriptWitness,
            };
        });
        return psbt.extractTransaction();
    }

    buildRefundPsbt(swap: SwapIn, spendingTx: Transaction, outputAddress: string): Psbt {
        const psbt = this.buildContractSpendBasePsbt(swap, spendingTx, outputAddress);
        psbt.locktime = swap.timeoutBlockHeight;
        return psbt;
    }

    @OnEvent('nbxplorer.newtransaction')
    private async processNewTransaction(event: NBXplorerNewTransactionEvent): Promise<void> {
        const addressRegex = /ADDRESS:(.*)/;
        const match = event.data.trackedSource.match(addressRegex);
        if (match != null) {
            const swapInRepository = this.dataSource.getRepository(SwapIn);
            const txAddress = match[1];
            const swap = await swapInRepository.findOneBy({
                status: 'CREATED',
                contractAddress: txAddress,
            });
            if (swap == null) {
                return;
            }

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

            const preimage = await this.lnd.sendPayment(swap.invoice);
            swap.preImage = preimage;
            swap.status = 'INVOICE_PAID';
            await swapInRepository.save(swap);

            const claimTx = this.buildClaimTx(swap, Transaction.fromHex(event.data.transactionData.transaction));
            await this.nbxplorer.broadcastTx(claimTx);
            swap.status = 'CLAIMED';
            await swapInRepository.save(swap);
        }
    }

    @OnEvent('nbxplorer.newblock')
    private async processNewBlock(event: NBXplorerBlockEvent): Promise<void> {
        const swapInRepository = this.dataSource.getRepository(SwapIn);
        const expiredSwaps = await swapInRepository.findBy({
            status: 'CONTRACT_FUNDED',
            timeoutBlockHeight: LessThanOrEqual(event.data.height!+9),
        });
        for (const swap of expiredSwaps) {
            this.logger.log(`swap expired ${swap.id}`);
            swap.status = 'CONTRACT_EXPIRED';
            await swapInRepository.save(swap);
        }
    }
}
