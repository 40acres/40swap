import { Logger } from '@nestjs/common';
import { LessThanOrEqual, Repository } from 'typeorm';
import { BitcoinConfigurationDetails, BitcoinService } from './BitcoinService.js';
import {
    NBXplorerBlockEvent,
    NBXplorerNewTransactionEvent,
    NbxplorerService,
    NBXplorerTransaction,
} from './NbxplorerService.js';
import { LndService } from './LndService.js';
import { SwapOut } from './entities/SwapOut.js';
import assert from 'node:assert';
import { address, Transaction } from 'bitcoinjs-lib';
import { buildContractSpendBasePsbt, buildTransactionWithFee } from './bitcoin-utils.js';
import { signContractSpend, SwapOutStatus } from '@40swap/shared';
import { Invoice__Output } from './lnd/lnrpc/Invoice.js';
import { sleep } from './utils.js';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';

const ECPair = ECPairFactory(ecc);

export class SwapOutRunner {
    private readonly logger = new Logger(SwapOutRunner.name);
    private runningPromise: Promise<void>;
    private notifyFinished!: () => void;

    constructor(
        private swap: SwapOut,
        private repository: Repository<SwapOut>,
        private bitcoinConfig: BitcoinConfigurationDetails,
        private bitcoinService: BitcoinService,
        private nbxplorer: NbxplorerService,
        private lnd: LndService,
    ) {
        this.runningPromise = new Promise((resolve) => {
            this.notifyFinished = resolve;
        });
    }

    async run(): Promise<void> {
        if (this.swap.status === 'CREATED') {
            this.onStatusChange('CREATED');
        }
        return this.runningPromise;
    }

    stop(): Promise<void> {
        // TODO handle pause
        this.notifyFinished();
        return this.runningPromise;
    }

    async onStatusChange(status: SwapOutStatus): Promise<void> {
        const { swap } = this;
        if (status === 'CREATED') {
            let invoice: Invoice__Output|undefined;
            while (invoice?.state !== 'ACCEPTED') { // TODO handle error
                invoice = await this.lnd.lookUpInvoice(swap.preImageHash);
                await sleep(1000);
            }
            console.log(`invoice state ${invoice.state}`);
            swap.status = 'INVOICE_PAYMENT_INTENT_RECEIVED';
            await this.repository.save(this.swap);
            this.onStatusChange('INVOICE_PAYMENT_INTENT_RECEIVED');
        } else if (status === 'INVOICE_PAYMENT_INTENT_RECEIVED') {
            const invoice = await this.lnd.lookUpInvoice(swap.preImageHash);
            const lockTxId = await this.lnd.sendCoinsOnChain(swap.contractAddress!, invoice.value as unknown as number);
            let lockTx: NBXplorerTransaction|null = null;
            while (lockTx == null) {
                await sleep(1000);
                lockTx = await this.nbxplorer.getTx(lockTxId);
            }
            swap.lockTx = Buffer.from(lockTx.transaction, 'hex');
            swap.status = 'CONTRACT_FUNDED';
            await this.repository.save(swap);
            this.onStatusChange('CONTRACT_FUNDED');
        } else if (status === 'CONTRACT_EXPIRED') {
            assert(swap.lockTx != null);
            const refundTx = this.buildRefundTx(swap, Transaction.fromBuffer(swap.lockTx), await this.bitcoinService.getMinerFeeRate('low_prio'));
            await this.nbxplorer.broadcastTx(refundTx);
        }
    }

    async processNewTransaction(event: NBXplorerNewTransactionEvent): Promise<void> {
        const addressRegex = /ADDRESS:(.*)/;
        const match = event.data.trackedSource.match(addressRegex);
        if (match != null) {
            const txAddress = match[1];
            const swap = await this.repository.findOneBy({
                contractAddress: txAddress,
            });
            if (swap != null) {
                if (event.data.outputs.find(o => o.address === swap.contractAddress) != null) {
                    await this.processContractFundingTx(event);
                } else {
                    await this.processContractSpendingTx(event);
                }
            }
        }
    }

    private async processContractFundingTx(event: NBXplorerNewTransactionEvent): Promise<void> {
        console.log(`found lock tx sent by us ${JSON.stringify(event, null, 2)}`);
    }

    private async processContractSpendingTx(event: NBXplorerNewTransactionEvent): Promise<void> {
        const { swap } = this;
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
                await this.repository.save(swap);

                console.log('settling invoice');
                await this.lnd.settleInvoice(preimage);

                swap.status = 'CLAIMED';
                await this.repository.save(swap);
                this.onStatusChange('CLAIMED');
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
            await this.repository.save(swap);
            this.onStatusChange('REFUNDED');
        }
    }

    async processNewBlock(event: NBXplorerBlockEvent): Promise<void> {
        const expiredSwaps = await this.repository.findBy({
            status: 'CONTRACT_FUNDED',
            timeoutBlockHeight: LessThanOrEqual(event.data.height!),
        });
        for (const swap of expiredSwaps) {
            this.logger.log(`swap expired ${swap.id}`);
            swap.status = 'CONTRACT_EXPIRED';
            await this.repository.save(swap);
            this.onStatusChange('CONTRACT_EXPIRED');
        }
    }

    buildRefundTx(swap: SwapOut, spendingTx: Transaction, feeRate: number): Transaction {
        const { network } = this.bitcoinConfig;
        return buildTransactionWithFee(
            feeRate,
            (feeAmount, isFeeCalculationRun) => {
                const psbt = buildContractSpendBasePsbt({
                    swap,
                    network,
                    spendingTx,
                    outputAddress: swap.refundAddress,
                    feeAmount,
                });
                psbt.locktime = swap.timeoutBlockHeight;
                signContractSpend({
                    psbt,
                    network,
                    key: ECPair.fromPrivateKey(swap.refundKey),
                    preImage: Buffer.alloc(0),
                });
                return psbt;
            }
        ).extractTransaction();
    }
}