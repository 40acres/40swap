import { LndService } from './LndService.js';
import { NBXplorerNewTransactionEvent, NbxplorerService, NBXplorerTransaction } from './NbxplorerService.js';
import { DataSource } from 'typeorm';
import { createZodDto } from '@anatine/zod-nestjs';
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Invoice__Output } from './lnd/lnrpc/Invoice.js';
import { sleep } from './utils.js';
import Decimal from 'decimal.js';
import { reverseSwapScript } from './contracts.js';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import { payments, Transaction } from 'bitcoinjs-lib';
import assert from 'node:assert';
import { OnEvent } from '@nestjs/event-emitter';
import { SwapOut } from './entities/SwapOut.js';
import { claimSwapOutRequestSchema, GetSwapOutResponse, swapOutRequestSchema } from '@40swap/shared';
import { BitcoinConfigurationDetails } from './BitcoinService.js';

const ECPair = ECPairFactory(ecc);

class SwapOutRequestDto extends createZodDto(swapOutRequestSchema) {}
class ClaimSwapOutRequestDto extends createZodDto(claimSwapOutRequestSchema) {}

@Controller('/swap/out')
export class SwapOutController {
    constructor(
        private lnd: LndService,
        private nbxplorer: NbxplorerService,
        private dataSource: DataSource,
        private bitcoinConfig: BitcoinConfigurationDetails,
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
        const swap = await this.dataSource.getRepository(SwapOut).save({
            contractAddress: address,
            inputAmount: new Decimal(request.inputAmount),
            lockScript,
            status: 'CREATED',
            preImageHash: preImageHash,
            invoice,
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
    async claimSwap(@Body() request: ClaimSwapOutRequestDto, @Param('id') id: string): Promise<void> {
        // TODO validate claim tx and set output amount
        const tx = Transaction.fromHex(request.claimTx);
        await this.dataSource.getRepository(SwapOut).update(id, { claimTxId: tx.getHash().toString('hex') });
        await this.nbxplorer.broadcastTx(tx);
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
            console.log(`lockTx ${lockTx}`);
        }

        swap.lockTx = Buffer.from(lockTx.transaction, 'hex');
        swap.status = 'CONTRACT_FUNDED';
        await swapOutRepository.save(swap);
    }

    private mapToResponse(swap: SwapOut): GetSwapOutResponse {
        return {
            swapId: swap.id,
            timeoutBlockHeight: 10,
            redeemScript: swap.lockScript.toString('hex'),
            invoice: swap.invoice,
            contractAddress: swap.contractAddress,
            outputAmount: swap.outputAmount?.toNumber(),
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
                status: 'CONTRACT_FUNDED',
                contractAddress: txAddress,
            });
            if (swap != null) {
                if (event.data.outputs.find(o => o.address === swap.contractAddress) != null) {
                    console.log(`found lock tx sent by us ${JSON.stringify(event, null, 2)}`);
                } else {
                    console.log(`found claim tx ${JSON.stringify(event, null, 2)}`);
                    assert(swap.lockTx != null);
                    const tx = Transaction.fromHex(event.data.transactionData.transaction);
                    const swapTx = Transaction.fromBuffer(swap.lockTx);
                    const input = tx.ins.find(i => Buffer.from(i.hash).reverse().toString('hex') === swapTx.getHash().reverse().toString('hex'));
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
                    }
                }
            }
        }
    }
}