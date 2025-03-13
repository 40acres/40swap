import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { BitcoinConfigurationDetails, BitcoinService } from './BitcoinService.js';
import { NBXplorerBlockEvent, NBXplorerNewTransactionEvent, NbxplorerService } from './NbxplorerService.js';
import { LndService } from './LndService.js';
import { SwapOut } from './entities/SwapOut.js';
import assert from 'node:assert';
import { address, payments, Transaction } from 'bitcoinjs-lib';
import { buildContractSpendBasePsbt, buildTransactionWithFee, reverseSwapScript } from './bitcoin-utils.js';
import { signContractSpend, SwapOutStatus } from '@40swap/shared';
import { Invoice__Output } from './lnd/lnrpc/Invoice.js';
import { sleep } from './utils.js';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import Decimal from 'decimal.js';
import moment from 'moment/moment.js';
import { FourtySwapConfiguration } from './configuration.js';
import { clearInterval } from 'node:timers';
import * as liquid from 'liquidjs-lib';
import { liquid as liquidNetwork, regtest as liquidRegtest } from 'liquidjs-lib/src/networks.js';
import { bitcoin } from 'bitcoinjs-lib/src/networks.js';
import { LiquidPSETBuilder, liquidReverseSwapScript } from './LiquidUtils.js';

const ECPair = ECPairFactory(ecc);

export class SwapOutRunner {
    private readonly logger = new Logger(SwapOutRunner.name);
    private runningPromise: Promise<void>;
    private notifyFinished!: () => void;
    private expiryPoller: NodeJS.Timeout|undefined;

    constructor(
        private swap: SwapOut,
        private repository: Repository<SwapOut>,
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
            this.onStatusChange('CREATED');
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
                try {
                    await this.lnd.cancelInvoice(swap.preImageHash);
                } catch (e) {
                    this.logger.warn(`Error cancelling invoice after expiry (id=${this.swap.id})`, e);
                }
                swap.status = 'DONE';
                swap.outcome = 'EXPIRED';
                this.swap = await this.repository.save(swap);
                await this.stop();
            }
        } else {
            clearInterval(this.expiryPoller);
        }
    }

    async onStatusChange(status: SwapOutStatus): Promise<void> {
        const { swap } = this;
        this.logger.log(`Swap out changed to status ${status} (id=${this.swap.id})`);
        if (status === 'CREATED') {
            this.waitForLightningPaymentIntent();
        } else if (status === 'INVOICE_PAYMENT_INTENT_RECEIVED') {
            swap.timeoutBlockHeight = (await this.getCltvExpiry()) - this.swapConfig.lockBlockDelta.out;
            this.logger.debug(`Using timeoutBlockHeight=${swap.timeoutBlockHeight} (id=${swap.id})`);

            if (swap.chain === 'LIQUID') {
                swap.lockScript = liquidReverseSwapScript(
                    swap.preImageHash, 
                    swap.counterpartyPubKey, 
                    ECPair.fromPrivateKey(swap.unlockPrivKey).publicKey, 
                    swap.timeoutBlockHeight
                );
                const network = this.bitcoinConfig.network === bitcoin ? liquidNetwork : liquidRegtest;
                const p2wsh = liquid.payments.p2wsh({redeem: { output: swap.lockScript, network }, network});
                assert(p2wsh.address != null);
                swap.contractAddress = p2wsh.address;
                await this.nbxplorer.trackAddress(p2wsh.address, 'lbtc');
                this.swap = await this.repository.save(swap);
                const psbtTx = await new LiquidPSETBuilder(this.nbxplorer, this.swapConfig).buildLiquidPsbtTransaction(
                    swap.outputAmount.mul(1e8).toNumber(), p2wsh.address, network, p2wsh.blindkey, swap.timeoutBlockHeight
                );
                await this.nbxplorer.broadcastTx(psbtTx, 'lbtc');
            } else {
                swap.lockScript = reverseSwapScript(
                    this.swap.preImageHash,
                    swap.counterpartyPubKey,
                    ECPair.fromPrivateKey(swap.unlockPrivKey).publicKey,
                    swap.timeoutBlockHeight,
                );
                const { network } = this.bitcoinConfig;
                const { address: contractAddress } = payments.p2wsh({network, redeem: { output: swap.lockScript, network }});
                assert(contractAddress != null);
                swap.contractAddress = contractAddress;
                await this.nbxplorer.trackAddress(contractAddress);
                this.swap = await this.repository.save(swap);
                await this.lnd.sendCoinsOnChain(contractAddress, swap.outputAmount.mul(1e8).toNumber());
            }
        } else if (status === 'CONTRACT_EXPIRED') {
            assert(swap.lockTx != null);
            const refundTx = this.buildRefundTx(swap, Transaction.fromBuffer(swap.lockTx), await this.bitcoinService.getMinerFeeRate('low_prio'));
            await this.nbxplorer.broadcastTx(refundTx);
        }
    }

    private async getCltvExpiry(): Promise<number> {
        const invoice = await this.lnd.lookUpInvoice(this.swap.preImageHash);
        assert(invoice.state === 'ACCEPTED');
        assert(invoice.htlcs.length === 1);
        return invoice.htlcs[0].expiryHeight;
    }

    private async waitForLightningPaymentIntent(): Promise<void> {
        const { swap } = this;
        let invoice: Invoice__Output|undefined;
        while (swap.status === 'CREATED') { // it will stop if swap expires
            invoice = await this.lnd.lookUpInvoice(swap.preImageHash);
            if (invoice.state === 'ACCEPTED') {
                swap.status = 'INVOICE_PAYMENT_INTENT_RECEIVED';
                this.swap = await this.repository.save(this.swap);
                this.onStatusChange('INVOICE_PAYMENT_INTENT_RECEIVED');
                return;
            } else if (invoice.state === 'CANCELED') {
                // the swap will expire
                this.logger.log(`Invoice CANCELLED (id=${this.swap.id})`);
                return;
            }
            this.logger.debug(`Invoice state ${invoice.state} (id=${this.swap.id})`);
            await sleep(1000);
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

    // TODO refactor. It is very similar to SwapInRunner
    private async processContractFundingTx(event: NBXplorerNewTransactionEvent): Promise<void> {
        const { swap } = this;
        const output = event.data.outputs.find(o => o.address === swap.contractAddress);
        assert(output != null);
        const expectedAmount = new Decimal(output.value).div(1e8);
        if (!expectedAmount.equals(swap.outputAmount)) {
            // eslint-disable-next-line max-len
            this.logger.error(`Amount mismatch. Failed swap. Incoming ${expectedAmount.toNumber()}, expected ${swap.outputAmount.toNumber()} (id=${this.swap.id})`);
            return;
        }
        if (this.swap.status === 'INVOICE_PAYMENT_INTENT_RECEIVED' || this.swap.status === 'CONTRACT_FUNDED_UNCONFIRMED') {
            if (event.data.transactionData.height != null) {
                swap.lockTxHeight = event.data.transactionData.height;
            }
            swap.lockTx = Buffer.from(event.data.transactionData.transaction, 'hex');

            if (this.swap.status === 'INVOICE_PAYMENT_INTENT_RECEIVED') {
                swap.status = 'CONTRACT_FUNDED_UNCONFIRMED';
                this.swap = await this.repository.save(swap);
                await this.onStatusChange('CONTRACT_FUNDED_UNCONFIRMED');
            } else {
                this.swap = await this.repository.save(swap);
            }
        }
    }

    private async processContractSpendingTx(event: NBXplorerNewTransactionEvent): Promise<void> {
        const { swap } = this;
        assert(swap.lockTx != null);
        const lockTx = Transaction.fromBuffer(swap.lockTx);
        const unlockTx = Transaction.fromHex(event.data.transactionData.transaction);

        swap.unlockTx = Buffer.from(event.data.transactionData.transaction, 'hex');
        if (event.data.transactionData.height != null) {
            swap.unlockTxHeight = event.data.transactionData.height;
        }
        this.swap = await this.repository.save(swap);

        const isSendingToRefundAddress = unlockTx.outs.find(o => {
            try {
                return address.fromOutputScript(o.script, this.bitcoinConfig.network) === swap.sweepAddress;
            } catch (e) {
                return false;
            }
        }) != null;

        if (isSendingToRefundAddress) {
            if (this.swap.status === 'CONTRACT_EXPIRED') {
                swap.status = 'CONTRACT_REFUNDED_UNCONFIRMED';
                this.swap = await this.repository.save(swap);
                await this.onStatusChange('CONTRACT_REFUNDED_UNCONFIRMED');
            }
        } else {
            const input = unlockTx.ins.find(i => Buffer.from(i.hash).equals(lockTx.getHash()));
            if (input != null) {
                const preimage = input.witness[1];
                assert(preimage != null);
                swap.preImage = preimage;
                this.swap = await this.repository.save(swap);

                if (swap.status === 'CONTRACT_FUNDED') {
                    swap.status = 'CONTRACT_CLAIMED_UNCONFIRMED';
                    this.swap = await this.repository.save(swap);
                    this.onStatusChange('CONTRACT_CLAIMED_UNCONFIRMED');
                }
            } else {
                this.logger.warn(`Could not find preimage in claim tx ${event.data.transactionData.transactionHash} (id=${this.swap.id})`);
            }
        }
    }

    // TODO refactor. This is very similar to SwapInRunner
    async processNewBlock(event: NBXplorerBlockEvent): Promise<void> {
        const { swap } = this;
        if (swap.status === 'CONTRACT_FUNDED'  && swap.timeoutBlockHeight <= event.data.height) {
            swap.status = 'CONTRACT_EXPIRED';
            this.swap = await this.repository.save(swap);
            await this.onStatusChange('CONTRACT_EXPIRED');
        } else if (swap.status === 'CONTRACT_FUNDED_UNCONFIRMED' && this.bitcoinService.hasEnoughConfirmations(swap.lockTxHeight, event.data.height)) {
            swap.status = 'CONTRACT_FUNDED';
            this.swap = await this.repository.save(swap);
            await this.onStatusChange('CONTRACT_FUNDED');
        } else if (swap.status === 'CONTRACT_REFUNDED_UNCONFIRMED' && this.bitcoinService.hasEnoughConfirmations(swap.unlockTxHeight, event.data.height)) {
            swap.status = 'DONE';
            swap.outcome = 'REFUNDED';
            this.swap = await this.repository.save(swap);
            await this.onStatusChange('DONE');
        } else if (swap.status === 'CONTRACT_CLAIMED_UNCONFIRMED' && this.bitcoinService.hasEnoughConfirmations(swap.unlockTxHeight, event.data.height)) {
            assert(swap.preImage != null);
            this.logger.log(`Settling invoice (id=${this.swap.id})`);
            await this.lnd.settleInvoice(swap.preImage);
            swap.status = 'DONE';
            swap.outcome = 'SUCCESS';
            this.swap = await this.repository.save(swap);
            await this.onStatusChange('DONE');
        }
    }

    buildRefundTx(swap: SwapOut, spendingTx: Transaction, feeRate: number): Transaction {
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
                    outputAddress: swap.sweepAddress,
                    feeAmount,
                });
                psbt.locktime = swap.timeoutBlockHeight;
                signContractSpend({
                    psbt,
                    network,
                    key: ECPair.fromPrivateKey(swap.unlockPrivKey),
                    preImage: Buffer.alloc(0),
                });
                return psbt;
            }
        ).extractTransaction();
    }
}