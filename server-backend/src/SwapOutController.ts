import { LndService } from './LndService.js';
import { NBXplorerNewTransactionEvent, NbxplorerService } from './NbxplorerService.js';
import { DataSource } from 'typeorm';
import { createZodDto } from '@anatine/zod-nestjs';
import { swapOutRequestSchema, SwapOutResponse } from './api.js';
import { Body, Controller, Post } from '@nestjs/common';
import { Invoice__Output } from './lnd/lnrpc/Invoice.js';
import { sleep } from './utils.js';
import Decimal from 'decimal.js';
import { reverseSwapScript } from './contracts.js';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import { networks, payments, Transaction } from 'bitcoinjs-lib';
import assert from 'node:assert';
import { OnEvent } from '@nestjs/event-emitter';
import { SwapOut } from './entities/SwapOut.js';

const ECPair = ECPairFactory(ecc);

class SwapOutRequestDto extends createZodDto(swapOutRequestSchema) {}

@Controller('/swap/out')
export class SwapOutController {
    constructor(
        private lnd: LndService,
        private nbxplorer: NbxplorerService,
        private dataSource: DataSource,
    ) {}

    @Post()
    async createSwap(@Body() request: SwapOutRequestDto): Promise<SwapOutResponse> {
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
        const { address } = payments.p2wsh({
            network: networks.regtest,
            redeem: {
                output: lockScript,
                network: networks.regtest,
            },
        });
        assert(address != null);
        await this.nbxplorer.trackAddress(address);
        const swap = await this.dataSource.getRepository(SwapOut).save({
            contractAddress: address,
            inputAmount: new Decimal(request.inputAmount),
            outputAmount: new Decimal(0),
            lockScript,
            state: 'CREATED',
            preImageHash: preImageHash,
        });

        this.performSwap(swap);
        return {
            swapId: '123',
            timeoutBlockHeight: 10,
            redeemScript: lockScript.toString('hex'),
            invoice,
            contractAddress: address!,
            outputAmount: request.inputAmount,
        };
    }

    async performSwap(swap: SwapOut): Promise<void> {
        const swapOutRepository = this.dataSource.getRepository(SwapOut);
        let invoice: Invoice__Output|undefined;
        while (invoice?.state !== 'ACCEPTED') {
            invoice = await this.lnd.lookUpInvoice(swap.preImageHash);
            await sleep(1000);
        }
        console.log(`invoice state ${invoice.state}`);
        swap.state = 'INVOICE_PAYMENT_INTENT_RECEIVED';
        await swapOutRepository.save(swap);

        swap.lockTxId = await this.lnd.sendCoinsOnChain(swap.contractAddress!, invoice.value as unknown as number);
        swap.state = 'CONTRACT_FUNDED';
        await swapOutRepository.save(swap);
    }


    @OnEvent('nbxplorer.newtransaction')
    private async processNewTransaction(event: NBXplorerNewTransactionEvent): Promise<void> {
        const swapOutRepository = this.dataSource.getRepository(SwapOut);
        const addressRegex = /ADDRESS:(.*)/;
        const match = event.data.trackedSource.match(addressRegex);
        if (match != null) {
            const txAddress = match[1];
            const swap = await swapOutRepository.findOneBy({
                state: 'CONTRACT_FUNDED',
                contractAddress: txAddress,
            });
            if (swap != null) {
                if (event.data.outputs.find(o => o.address === swap.contractAddress) != null) {
                    console.log(`found lock tx sent by us ${JSON.stringify(event, null, 2)}`);
                } else {
                    console.log(`found claim tx ${JSON.stringify(event, null, 2)}`);
                    const tx = Transaction.fromHex(event.data.transactionData.transaction);
                    const input = tx.ins.find(i => Buffer.from(i.hash).reverse().toString('hex') === swap.lockTxId);
                    if (input != null) {
                        const preimage = input.witness[1];
                        assert(preimage != null);
                        swap.preImage = preimage;
                        swap.claimTxId = event.data.transactionData.transactionHash;
                        await swapOutRepository.save(swap);

                        console.log('settling invoice');
                        await this.lnd.settleInvoice(preimage);

                        swap.state = 'CLAIMED';
                        await swapOutRepository.save(swap);
                    }
                }
            }
        }
    }
}