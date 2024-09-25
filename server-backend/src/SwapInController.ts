import { Body, Controller, Get, Logger, Param, Post, UsePipes } from '@nestjs/common';
import { createZodDto, ZodValidationPipe } from '@anatine/zod-nestjs';
import { decode } from '@boltz/bolt11';
import assert from 'node:assert';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import { networks, payments, Psbt, script, Transaction } from 'bitcoinjs-lib';
import { witnessStackToScriptWitness } from 'bitcoinjs-lib/src/psbt/psbtutils.js';
import { NBXplorerNewTransactionEvent, NbxplorerService } from './NbxplorerService.js';
import { OnEvent } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { SwapIn } from './entities/SwapIn.js';
import Decimal from 'decimal.js';
import { LndService } from './LndService.js';
import { swapScript } from './contracts.js';
import { GetSwapInResponse, swapInRequestSchema } from '@40swap/shared';

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
    ) {
        const k = ECPair.makeRandom();
        console.log(`pub: ${k.publicKey.toString('hex')}`);
        console.log(`priv: ${k.privateKey!.toString('hex')}`);
    }

    @Post()
    async createSwap(@Body() request: SwapInRequestDto): Promise<GetSwapInResponse> {
        const { tags } = decode(request.invoice, { bech32: 'bcrt' } );
        const hashTag = tags.find(t => t.tagName === 'payment_hash');
        assert(hashTag);
        assert(typeof hashTag.data === 'string');
        const paymentHash = hashTag.data;

        const claimKey = ECPair.makeRandom();
        const lockScript = swapScript(
            Buffer.from(paymentHash, 'hex'),
            Buffer.from(claimKey.publicKey),
            Buffer.from(request.refundPublicKey, 'hex'),
            10,
        );
        const { address } = payments.p2wsh({
            network: networks.regtest,
            redeem: {
                output: lockScript,
                network: networks.regtest,
            },
        });
        assert(address);
        await this.nbxplorer.trackAddress(address);

        const swap = await this.dataSource.getRepository(SwapIn).save({
            contractAddress: address,
            invoice: request.invoice,
            lockScript,
            privKey: claimKey.privateKey!,
            inputAmount: new Decimal(0),
            outputAmount: new Decimal(0),
            state: 'CREATED',
            sweepAddress: await this.lnd.getNewAddress(),
        });

        return this.mapToResponse(swap);
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
            timeoutBlockHeight: 10,
            status: swap.state,
        };
    }

    async constructClaimTx(
        swap: SwapIn,
        spendingOutput: NBXplorerNewTransactionEvent['data']['outputs'][number],
        txHash: string,
    ): Promise<Transaction> {
        const network = networks.regtest;
        const psbt = new Psbt({ network });
        psbt.addOutput({
            address: swap.sweepAddress,
            value: spendingOutput.value - 200, // TODO calculate fee
        });

        const p2wsh = payments.p2wsh({ redeem: { output: swap.lockScript, network }, network });
        psbt.addInput({
            hash: txHash,
            index: spendingOutput.index,
            witnessScript: swap.lockScript,
            witnessUtxo: {
                script: p2wsh.output!,
                value: spendingOutput.value,
            },
        });
        psbt.signInput(0, ECPair.fromPrivateKey(swap.privKey), [Transaction.SIGHASH_ALL]);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        psbt.finalizeInput(0, (inputIndex, input, arg2, isSegwit, isP2SH, isP2WSH): {
            finalScriptSig: Buffer | undefined;
            finalScriptWitness: Buffer | undefined;
        } => {
            assert(input.partialSig != null);
            const redeemPayment = payments.p2wsh({
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

    @OnEvent('nbxplorer.newtransaction')
    private async processNewTransaction(event: NBXplorerNewTransactionEvent): Promise<void> {
        const addressRegex = /ADDRESS:(.*)/;
        const match = event.data.trackedSource.match(addressRegex);
        if (match != null) {
            const swapInRepository = this.dataSource.getRepository(SwapIn);
            const txAddress = match[1];
            const swap = await swapInRepository.findOneBy({
                state: 'CREATED',
                contractAddress: txAddress,
            });
            if (swap == null) {
                return;
            }
            const output = event.data.outputs.find(o => o.address === swap.contractAddress);
            assert(output != null);
            swap.state = 'CONTRACT_FUNDED';
            swap.inputAmount = new Decimal(output.value).div(1e8).toDecimalPlaces(8);
            await swapInRepository.save(swap);

            const preimage = await this.lnd.sendPayment(swap.invoice);
            swap.preImage = preimage;
            swap.state = 'INVOICE_PAID';
            await swapInRepository.save(swap);

            const claimTx = await this.constructClaimTx(swap, output, event.data.transactionData.transactionHash);
            await this.nbxplorer.broadcastTx(claimTx);
            swap.state = 'CLAIMED';
            await swapInRepository.save(swap);
        }
    }
}
