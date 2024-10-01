import { LndService } from './LndService.js';
import {
    NBXplorerBlockEvent,
    NBXplorerNewTransactionEvent,
    NbxplorerService,
    NBXplorerTransaction,
} from './NbxplorerService.js';
import { DataSource, LessThanOrEqual } from 'typeorm';
import { createZodDto } from '@anatine/zod-nestjs';
import { BadRequestException, Body, Controller, Get, Logger, Param, Post, Query } from '@nestjs/common';
import { Invoice__Output } from './lnd/lnrpc/Invoice.js';
import { sleep } from './utils.js';
import Decimal from 'decimal.js';
import { reverseSwapScript } from './contracts.js';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import { address, payments, Psbt, script, Transaction } from 'bitcoinjs-lib';
import assert from 'node:assert';
import { OnEvent } from '@nestjs/event-emitter';
import { SwapOut } from './entities/SwapOut.js';
import { GetSwapOutResponse, PsbtResponse, swapOutRequestSchema, txRequestSchema } from '@40swap/shared';
import { BitcoinConfigurationDetails, BitcoinService } from './BitcoinService.js';
import { witnessStackToScriptWitness } from 'bitcoinjs-lib/src/psbt/psbtutils.js';

const ECPair = ECPairFactory(ecc);

class SwapOutRequestDto extends createZodDto(swapOutRequestSchema) {}
class TxRequestDto extends createZodDto(txRequestSchema) {}

@Controller('/swap/out')
export class SwapOutController {
    private readonly logger = new Logger(SwapOutController.name);

    constructor(
        private lnd: LndService,
        private nbxplorer: NbxplorerService,
        private dataSource: DataSource,
        private bitcoinConfig: BitcoinConfigurationDetails,
        private bitcoinService: BitcoinService,
    ) {}

    @Post()
    async createSwap(@Body() request: SwapOutRequestDto): Promise<GetSwapOutResponse> {
        const { network } = this.bitcoinConfig;
        const preImageHash = Buffer.from(request.preImageHash, 'hex');
        const invoice = await this.lnd.addHodlInvoice({
            hash: preImageHash,
            amount: new Decimal(request.inputAmount).mul(1e8).toDecimalPlaces(0).toNumber(),
        });

        const refundKey = ECPair.makeRandom();
        const lockScript = reverseSwapScript(
            Buffer.from(request.preImageHash, 'hex'),
            Buffer.from(request.claimPubKey, 'hex'),
            refundKey.publicKey,
            10,
        );
        const { address } = payments.p2wsh({network, redeem: { output: lockScript, network }});
        assert(address != null);
        await this.nbxplorer.trackAddress(address);
        const timeoutBlockHeight = (await this.bitcoinService.getBlockHeight()) + this.bitcoinConfig.swapLockBlockDelta;
        const refundAddress = await this.lnd.getNewAddress();
        const swap = await this.dataSource.getRepository(SwapOut).save({
            contractAddress: address,
            inputAmount: new Decimal(request.inputAmount),
            outputAmount: new Decimal(0),
            lockScript,
            status: 'CREATED',
            preImageHash: preImageHash,
            invoice,
            timeoutBlockHeight,
            refundAddress,
            refundKey: refundKey.privateKey,
        });

        this.performSwap(swap);
        return this.mapToResponse(swap);
    }

    @Get('/:id')
    async getSwap(@Param('id') id: string): Promise<GetSwapOutResponse> {
        const swap = await this.dataSource.getRepository(SwapOut).findOneByOrFail({ id });
        return this.mapToResponse(swap);
    }

    @Post('/:id/claim')
    async claimSwap(@Body() request: TxRequestDto, @Param('id') id: string): Promise<void> {
        // TODO validate claim tx and set output amount
        const tx = Transaction.fromHex(request.tx);
        await this.dataSource.getRepository(SwapOut).update(id, { claimTxId: tx.getHash().toString('hex') });
        await this.nbxplorer.broadcastTx(tx);
    }

    @Get('/:id/claim-psbt')
    async getClaimPsbt(@Param('id') id: string, @Query('address') outputAddress?: string): Promise<PsbtResponse> {
        if (outputAddress == null) {
            throw new BadRequestException('address is required');
        }
        try {
            address.toOutputScript(outputAddress, this.bitcoinConfig.network);
        } catch (e) {
            throw new BadRequestException(`invalid address ${outputAddress}`);
        }
        const swap = await this.dataSource.getRepository(SwapOut).findOneByOrFail({ id });
        assert(swap.lockTx != null);
        const lockTx = Transaction.fromBuffer(swap.lockTx);
        const claimPsbt = this.buildClaimPsbt(swap, lockTx, outputAddress);
        return { psbt: claimPsbt.toBase64() };
    }

    async performSwap(swap: SwapOut): Promise<void> {
        const swapOutRepository = this.dataSource.getRepository(SwapOut);
        let invoice: Invoice__Output|undefined;
        while (invoice?.state !== 'ACCEPTED') {
            invoice = await this.lnd.lookUpInvoice(swap.preImageHash);
            await sleep(1000);
        }
        console.log(`invoice state ${invoice.state}`);
        swap.status = 'INVOICE_PAYMENT_INTENT_RECEIVED';
        await swapOutRepository.save(swap);

        const lockTxId = await this.lnd.sendCoinsOnChain(swap.contractAddress!, invoice.value as unknown as number);
        let lockTx: NBXplorerTransaction|null = null;

        while (lockTx == null) {
            await sleep(1000);
            lockTx = await this.nbxplorer.getTx(lockTxId);
        }

        swap.lockTx = Buffer.from(lockTx.transaction, 'hex');
        swap.status = 'CONTRACT_FUNDED';
        await swapOutRepository.save(swap);
    }

    buildClaimPsbt(swap: SwapOut, spendingTx: Transaction, claimAddress: string): Psbt {
        return this.buildContractSpendBasePsbt(swap, spendingTx, claimAddress);
    }

    buildRefundTx(swap: SwapOut, spendingTx: Transaction): Transaction {
        const { network } = this.bitcoinConfig;
        const psbt = this.buildContractSpendBasePsbt(swap, spendingTx, swap.refundAddress);
        psbt.locktime = swap.timeoutBlockHeight;
        psbt.signInput(0, ECPair.fromPrivateKey(swap.refundKey), [Transaction.SIGHASH_ALL]);
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
                        Buffer.from('0x00', 'hex'),
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

    // TODO this is the same as swap in
    buildContractSpendBasePsbt(swap: SwapOut, spendingTx: Transaction, outputAddress: string): Psbt {
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

        const psbt = new Psbt({ network });
        console.log(`spending contract to ${outputAddress}`);
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

    private mapToResponse(swap: SwapOut): GetSwapOutResponse {
        return {
            swapId: swap.id,
            timeoutBlockHeight: swap.timeoutBlockHeight,
            redeemScript: swap.lockScript.toString('hex'),
            invoice: swap.invoice,
            contractAddress: swap.contractAddress,
            outputAmount: swap.outputAmount.toNumber(),
            status: swap.status,
            lockTx: swap.lockTx?.toString('hex'),
        };
    }

    @OnEvent('nbxplorer.newtransaction')
    private async processNewTransaction(event: NBXplorerNewTransactionEvent): Promise<void> {
        const swapOutRepository = this.dataSource.getRepository(SwapOut);
        const addressRegex = /ADDRESS:(.*)/;
        const match = event.data.trackedSource.match(addressRegex);
        if (match != null) {
            const txAddress = match[1];
            const swap = await swapOutRepository.findOneBy({
                contractAddress: txAddress,
            });
            if (swap != null) {
                if (event.data.outputs.find(o => o.address === swap.contractAddress) != null) {
                    await this.processContractFundingTx(swap, event);
                } else {
                    await this.processContractSpendingTx(swap, event);
                }
            }
        }
    }

    async processContractFundingTx(swap: SwapOut, event: NBXplorerNewTransactionEvent): Promise<void> {
        console.log(`found lock tx sent by us ${JSON.stringify(event, null, 2)}`);
    }

    async processContractSpendingTx(swap: SwapOut, event: NBXplorerNewTransactionEvent): Promise<void> {
        const swapOutRepository = this.dataSource.getRepository(SwapOut);
        assert(swap.lockTx != null);
        const swapTx = Transaction.fromBuffer(swap.lockTx);
        const tx = Transaction.fromHex(event.data.transactionData.transaction);

        const isSendingToRefundAddress = tx.outs.find(o => {
            try {
                return address.fromOutputScript(o.script, this.bitcoinConfig.network) === swap.refundAddress;
            } catch (e) {
                return false;
            }
        }) != null;


        if (!isSendingToRefundAddress) {
            console.log(`found claim tx ${JSON.stringify(event, null, 2)}`);
            if (swap.status !== 'CONTRACT_FUNDED') {
                console.log(`swap in bad state ${swap.status}`);
                return;
            }
            const input = tx.ins.find(i => Buffer.from(i.hash).equals(swapTx.getHash()));
            if (input != null) {
                const preimage = input.witness[1];
                assert(preimage != null);
                swap.preImage = preimage;
                swap.claimTxId = event.data.transactionData.transactionHash;
                await swapOutRepository.save(swap);

                console.log('settling invoice');
                await this.lnd.settleInvoice(preimage);

                swap.status = 'CLAIMED';
                await swapOutRepository.save(swap);
            } else {
                console.log('could not find preimage in claim tx');
            }
        } else {
            console.log(`found refund tx ${JSON.stringify(event, null, 2)}`);
            if (swap.status !== 'CONTRACT_EXPIRED') {
                console.log(`swap in bad state ${swap.status}`);
                return;
            }

            swap.status = 'REFUNDED';
            await swapOutRepository.save(swap);
        }
    }

    @OnEvent('nbxplorer.newblock')
    private async processNewBlock(event: NBXplorerBlockEvent): Promise<void> {
        const swapOutRepository = this.dataSource.getRepository(SwapOut);
        const expiredSwaps = await swapOutRepository.findBy({
            status: 'CONTRACT_FUNDED',
            timeoutBlockHeight: LessThanOrEqual(event.data.height!),
        });
        for (const swap of expiredSwaps) {
            this.logger.log(`swap expired ${swap.id}`);
            swap.status = 'CONTRACT_EXPIRED';
            await swapOutRepository.save(swap);

            assert(swap.lockTx != null);
            const refundTx = this.buildRefundTx(swap, Transaction.fromBuffer(swap.lockTx));
            await this.nbxplorer.broadcastTx(refundTx);
        }
    }
}