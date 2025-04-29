import { NBXplorerBlockEvent, NBXplorerNewTransactionEvent, NbxplorerService } from './NbxplorerService.js';
import { Logger } from '@nestjs/common';
import { SwapIn } from './entities/SwapIn.js';
import { Repository } from 'typeorm';
import assert from 'node:assert';
import Decimal from 'decimal.js';
import { address, Transaction } from 'bitcoinjs-lib';
import { BitcoinConfigurationDetails, BitcoinService } from './BitcoinService.js';
import { LndService } from './LndService.js';
import { buildContractSpendBasePsbt, buildTransactionWithFee } from './bitcoin-utils.js';
import { signContractSpend, SwapInStatus } from '@40swap/shared';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import moment from 'moment';
import { FourtySwapConfiguration } from './configuration.js';
import { clearInterval } from 'node:timers';
import { sleep } from './utils.js';

const ECPair = ECPairFactory(ecc);

export class SwapInRunner {
    private readonly logger = new Logger(SwapInRunner.name);
    private runningPromise: Promise<void>;
    private notifyFinished!: () => void;
    private expiryPoller: NodeJS.Timeout | undefined;

    constructor(
        private swap: SwapIn,
        private repository: Repository<SwapIn>,
        private bitcoinConfig: BitcoinConfigurationDetails,
        private bitcoinService: BitcoinService,
        private nbxplorer: NbxplorerService,
        private lnd: LndService,
        private swapConfig: FourtySwapConfiguration['swap'],
    ) {
        this.runningPromise = new Promise((resolve) => {
            this.notifyFinished = resolve;
        });
    }

    async run(): Promise<void> {
        if (this.swap.status === 'CREATED') {
            this.expiryPoller = setInterval(
                () => this.checkExpiry(),
                moment.duration(1, 'minute').asMilliseconds(),
            );
        }
        return this.runningPromise;
    }

    stop(): Promise<void> {
        // TODO handle pause
        this.notifyFinished();
        clearInterval(this.expiryPoller);
        return this.runningPromise;
    }

    private async checkExpiry(): Promise<void> {
        const { swap } = this;
        if (swap.status === 'CREATED') {
            const expired = moment(swap.createdAt).isBefore(moment().subtract(this.swapConfig.expiryDuration));
            if (expired) {
                this.logger.log(`Swap expired (id=${this.swap.id})`);
                swap.status = 'DONE';
                swap.outcome = 'EXPIRED';
                this.swap = await this.repository.save(swap);
                await this.stop();
            }
        } else {
            clearInterval(this.expiryPoller);
        }
    }

    private async retrySendPayment(invoice: string, cltvLimit: number, retries = 3, initialDelay = 300000, backoffFactor = 2): Promise<Buffer> {
        let delay = initialDelay;
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                return await this.lnd.sendPayment(invoice, cltvLimit);
            } catch (e) {
                this.logger.warn(`Attempt ${attempt} to send payment failed (id=${this.swap.id})`, e);
                if (attempt === retries) {
                    throw e; // Throw error after exhausting retries
                }
                await sleep(delay);
                delay *= backoffFactor; // Double the delay for the next retry
            }
        }
        throw new Error('Retries exhausted');
    }

    private async onStatusChange(status: SwapInStatus): Promise<void> {
        this.logger.log(`Swap in changed to status ${status} (id=${this.swap.id})`);
        
        if (status === 'CONTRACT_FUNDED') {
            try {
                const cltvLimit = this.swap.timeoutBlockHeight - (await this.bitcoinService.getBlockHeight()) - 6;
                this.swap.preImage = await this.retrySendPayment(this.swap.invoice, cltvLimit);
            } catch (e) {
                // we don't do anything, just let the contract expire and handle it as a refund
                this.logger.error(`The lightning payment failed after retries (id=${this.swap.id})`, e);
                return;
            }
            this.swap.status = 'INVOICE_PAID';
            this.swap = await this.repository.save(this.swap);
            this.onStatusChange('INVOICE_PAID');
        } else if (status === 'INVOICE_PAID') {
            const claimTx = this.buildClaimTx(
                this.swap,
                Transaction.fromBuffer(this.swap.lockTx!),
                await this.bitcoinService.getMinerFeeRate('low_prio'),
            );
            await this.nbxplorer.broadcastTx(claimTx);
        } else if (status === 'DONE') {
            this.notifyFinished();
        }
    }

    async processNewTransaction(event: NBXplorerNewTransactionEvent): Promise<void> {
        const { swap } = this;
        const addressRegex = /ADDRESS:(.*)/;
        const match = event.data.trackedSource.match(addressRegex);
        if (match != null) {
            const txAddress = match[1];
            if (swap.contractAddress === txAddress) {
                if (event.data.outputs.find(o => o.address === swap.contractAddress) != null) {
                    await this.processContractFundingTx(event);
                } else {
                    await this.processContractSpendingTx(event);
                }
            }
        }
    }

    private async processContractFundingTx(event: NBXplorerNewTransactionEvent): Promise<void> {
        this.logger.debug(`Event data: ${JSON.stringify(event.data)}`);

        const { swap } = this;
        // TODO: the output is also found by buildClaimTx(), needs refactor
        const output = event.data.outputs.find(o => o.address === swap.contractAddress);
        assert(output != null);
        const receivedAmount = new Decimal(output.value).div(1e8);
        // Handle partial payment by checking if the received amount is different than the expected amount, if so, this is considered a failed swap but will be processed until contract is expired to be able to be refunded by the sender
        if (!receivedAmount.equals(swap.inputAmount)) {
            // eslint-disable-next-line max-len
            this.logger.warn(`Amount mismatch, partial payment. Failed swap. Incoming ${receivedAmount.toNumber()}, expected ${swap.inputAmount.toNumber()} (id=${this.swap.id})`);
            if (this.swap.status === 'CREATED') {
                swap.status = 'PARTIAL_PAYMENT_UNCONFIRMED';
                this.swap = await this.repository.save(swap);
            }            
        }                        
                                            
        if (this.swap.status === 'CREATED' || this.swap.status === 'CONTRACT_FUNDED_UNCONFIRMED'|| this.swap.status === 'PARTIAL_PAYMENT_UNCONFIRMED') {

            const output = event.data.outputs.find(o => o.address === swap.contractAddress)!;
            if (event.data.transactionData.height != null) {
                swap.lockTxHeight = event.data.transactionData.height;
            }
            swap.inputAmount = new Decimal(output.value).div(1e8).toDecimalPlaces(8);
            swap.lockTx = Buffer.from(event.data.transactionData.transaction, 'hex');
            if (this.swap.status === 'CREATED') {
                swap.status = 'CONTRACT_FUNDED_UNCONFIRMED';
                this.swap = await this.repository.save(swap);
                void this.onStatusChange('CONTRACT_FUNDED_UNCONFIRMED');
            } else {
                this.swap = await this.repository.save(swap);
            }
        }
    }

    private async processContractSpendingTx(event: NBXplorerNewTransactionEvent): Promise<void> {
        const { swap } = this;
        assert(swap.lockTx != null);

        const unlockTx = Transaction.fromHex(event.data.transactionData.transaction);
        const isPayingToExternalAddress = event.data.outputs.length === 0; // nbxplorer does not list outputs if it's spending a tracking utxo
        const isSpendingFromContract = unlockTx.ins.find(i => i.hash.equals(Transaction.fromBuffer(swap.lockTx!).getHash())) != null;
        const isPayingToSweepAddress = unlockTx.outs.find(o => {
            try {
                return address.fromOutputScript(o.script, this.bitcoinConfig.network) === swap.sweepAddress;
            } catch (e) {
                return false;
            }
        }) != null;

        if (isSpendingFromContract && isPayingToExternalAddress) {
            swap.unlockTx = unlockTx.toBuffer();
            if (event.data.transactionData.height != null) {
                swap.unlockTxHeight = event.data.transactionData.height;
            }
            this.swap = await this.repository.save(swap);
            if (isPayingToSweepAddress) {
                if (this.swap.status === 'INVOICE_PAID') {
                    swap.status = 'CONTRACT_CLAIMED_UNCONFIRMED';
                    this.swap = await this.repository.save(swap);
                    void this.onStatusChange('CONTRACT_CLAIMED_UNCONFIRMED');
                }
            } else {
                if (this.swap.status === 'CONTRACT_EXPIRED') {
                    swap.status = 'CONTRACT_REFUNDED_UNCONFIRMED';
                    this.swap = await this.repository.save(swap);
                    void this.onStatusChange('CONTRACT_REFUNDED_UNCONFIRMED');
                }
            }
        }
    }

    async processNewBlock(event: NBXplorerBlockEvent): Promise<void> {
        this.logger.debug(`Processing new block ${event.data.height} (swap=${this.swap})`);
        const { swap } = this;
        if ((swap.status === 'CONTRACT_FUNDED' || swap.status === 'CONTRACT_FUNDED_UNCONFIRMED' || swap.status === 'PARTIAL_PAYMENT_CONFIRMED')
            && swap.timeoutBlockHeight <= event.data.height) {
            swap.status = 'CONTRACT_EXPIRED';
            this.swap = await this.repository.save(swap);
            void this.onStatusChange('CONTRACT_EXPIRED');
        } else if ((swap.status === 'PARTIAL_PAYMENT_UNCONFIRMED') && this.bitcoinService.hasEnoughConfirmations(swap.lockTxHeight, event.data.height)) {
            swap.status = 'PARTIAL_PAYMENT_CONFIRMED';
            this.swap = await this.repository.save(swap);
        } else if (swap.status === 'CONTRACT_FUNDED_UNCONFIRMED' && this.bitcoinService.hasEnoughConfirmations(swap.lockTxHeight, event.data.height)) {
            swap.status = 'CONTRACT_FUNDED';
            this.swap = await this.repository.save(swap);
            void this.onStatusChange('CONTRACT_FUNDED');
        } else if (swap.status === 'CONTRACT_REFUNDED_UNCONFIRMED' && this.bitcoinService.hasEnoughConfirmations(swap.unlockTxHeight, event.data.height)) {
            swap.status = 'DONE';
            swap.outcome = 'REFUNDED';
            this.swap = await this.repository.save(swap);
            void this.onStatusChange('DONE');
        } else if (swap.status === 'CONTRACT_CLAIMED_UNCONFIRMED' && this.bitcoinService.hasEnoughConfirmations(swap.unlockTxHeight, event.data.height)) {
            swap.status = 'DONE';
            swap.outcome = 'SUCCESS';
            this.swap = await this.repository.save(swap);
            void this.onStatusChange('DONE');
        }
    }

    buildClaimTx(swap: SwapIn, spendingTx: Transaction, feeRate: number): Transaction {
        const { network } = this.bitcoinConfig;
        return buildTransactionWithFee(
            feeRate,
            (feeAmount, isFeeCalculationRun) => {
                const psbt = buildContractSpendBasePsbt({
                    contractAddress: swap.contractAddress,
                    lockScript: swap.lockScript,
                    network,
                    spendingTx,
                    outputAddress: swap.sweepAddress,
                    feeAmount,
                });
                signContractSpend({
                    psbt,
                    key: ECPair.fromPrivateKey(swap.unlockPrivKey),
                    network: this.bitcoinConfig.network,
                    preImage: swap.preImage!,
                });
                return psbt;
            },
        ).extractTransaction();
    }
}