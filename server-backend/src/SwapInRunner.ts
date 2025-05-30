import { 
    NBXplorerBlockEvent, 
    NBXplorerBitcoinTransactionOutput, 
    NBXplorerLiquidTransactionOutput, 
    NBXplorerNewTransactionEvent, 
    NbxplorerService,
} from './NbxplorerService.js';
import { Logger } from '@nestjs/common';
import { SwapIn } from './entities/SwapIn.js';
import { Repository } from 'typeorm';
import assert from 'node:assert';
import Decimal from 'decimal.js';
import { address, Transaction } from 'bitcoinjs-lib';
import { BitcoinConfigurationDetails, BitcoinService } from './BitcoinService.js';
import { LndService } from './LndService.js';
import { buildContractSpendBasePsbt, buildTransactionWithFee } from './bitcoin-utils.js';
import { Chain, getLiquidNetworkFromBitcoinNetwork, signContractSpend, SwapInStatus } from '@40swap/shared';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import moment from 'moment';
import { FourtySwapConfiguration } from './configuration.js';
import { clearInterval } from 'node:timers';
import { sleep } from './utils.js';
import * as liquid from 'liquidjs-lib';
import { liquidBlocksToBitcoinBlocks, LiquidClaimPSETBuilder } from './LiquidUtils.js';

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
        private elementsConfig?: FourtySwapConfiguration['elements'],
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
                const oneHourDifference = 6; // Ensure the cltv is lower enoght than swap expiry
                if (this.swap.chain === 'BITCOIN') {
                    const cltvLimit = this.swap.timeoutBlockHeight - (await this.bitcoinService.getBlockHeight()) - oneHourDifference;
                    this.swap.preImage = await this.retrySendPayment(this.swap.invoice, cltvLimit);
                } else if (this.swap.chain === 'LIQUID') {
                    const liquidBitcoinRatio = 10; // Each bitcoin block is worth 10 liquid blocks (10min - 1min)
                    const liquidDifference = oneHourDifference * liquidBitcoinRatio;
                    const currentLiquidHeight = (await this.nbxplorer.getNetworkStatus('lbtc')).chainHeight;
                    const cltvLimit = this.swap.timeoutBlockHeight - currentLiquidHeight - liquidDifference;
                    this.swap.preImage = await this.retrySendPayment(this.swap.invoice, liquidBlocksToBitcoinBlocks(cltvLimit));
                }
            } catch (e) {
                // we don't do anything, just let the contract expire and handle it as a refund
                this.logger.error(`The lightning payment failed after retries (id=${this.swap.id})`, e);
                return;
            }
            this.swap.status = 'INVOICE_PAID';
            this.swap = await this.repository.save(this.swap);
            this.onStatusChange('INVOICE_PAID');
        } else if (status === 'INVOICE_PAID') {
            let claimTx: Transaction | liquid.Transaction | null = null;
            if (this.swap.chain === 'BITCOIN') {
                claimTx = this.buildClaimTx(
                    this.swap,
                    Transaction.fromBuffer(this.swap.lockTx!),
                    await this.bitcoinService.getMinerFeeRate('low_prio'),
                );
            } else if (this.swap.chain === 'LIQUID') {
                claimTx = await this.buildLiquidClaimTx(
                    this.swap,
                    liquid.Transaction.fromBuffer(this.swap.lockTx!),
                );
            }
            assert(claimTx != null, 'There was a problem building the claim transaction');
            await this.nbxplorer.broadcastTx(claimTx, this.swap.chain === 'BITCOIN' ? 'btc' : 'lbtc');
        } else if (status === 'DONE') {
            this.notifyFinished();
        }
    }

    async processNewTransaction(event: NBXplorerNewTransactionEvent, cryptoCode: Chain): Promise<void> {
        const { swap } = this;
        if (swap.chain !== cryptoCode) {
            return;
        }
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
        assert(output != null, 'There was a problem finding the output');
        
        // Handle both Bitcoin and Liquid outputs by checking if it's a Liquid transaction
        const isLiquidTx = 'cryptoCode' in event.data && event.data.cryptoCode === 'LBTC';
        const outputValue = isLiquidTx
            ? new Decimal((output as NBXplorerLiquidTransactionOutput).value.value)
            : new Decimal((output as NBXplorerBitcoinTransactionOutput).value);
            
        const receivedAmount = new Decimal(outputValue).div(1e8);
        // Handle mismatched payment by checking if the received amount is different than the expected amount, if so, this is considered a failed swap but will be processed until contract is expired to be able to be refunded by the sender
        if (!receivedAmount.equals(swap.inputAmount)) {
            // eslint-disable-next-line max-len
            this.logger.warn(`Contract amount mismatch. Incoming ${receivedAmount.toNumber()}, expected ${swap.inputAmount.toNumber()} (id=${this.swap.id})`);
            if (this.swap.status === 'CREATED') {
                swap.status = 'CONTRACT_AMOUNT_MISMATCH_UNCONFIRMED';
                this.swap = await this.repository.save(swap);
                void this.onStatusChange('CONTRACT_AMOUNT_MISMATCH_UNCONFIRMED');
                return;
            }            
        }                        
                                            
        if (this.swap.status === 'CREATED' || this.swap.status === 'CONTRACT_FUNDED_UNCONFIRMED'|| this.swap.status === 'CONTRACT_AMOUNT_MISMATCH_UNCONFIRMED') {

            if (event.data.transactionData.height != null) {
                swap.lockTxHeight = event.data.transactionData.height;
            }
            swap.inputAmount = receivedAmount.toDecimalPlaces(8);
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
        let unlockTx: Transaction | liquid.Transaction | null = null;
        let isPayingToExternalAddress = false;
        let isSpendingFromContract = false;
        let isPayingToSweepAddress = false;

        if (swap.chain === 'BITCOIN') {
            unlockTx = Transaction.fromHex(event.data.transactionData.transaction);
            isPayingToExternalAddress = event.data.outputs.length === 0; // nbxplorer does not list outputs if it's spending a tracking utxo
            isSpendingFromContract = unlockTx.ins.find(i => i.hash.equals(Transaction.fromBuffer(swap.lockTx!).getHash())) != null;
            isPayingToSweepAddress = unlockTx.outs.find(o => {
                try {
                    return address.fromOutputScript(o.script, this.bitcoinConfig.network) === swap.sweepAddress;
                } catch (e) {
                    return false;
                }
            }) != null;
        } else if (swap.chain === 'LIQUID') {
            const network = getLiquidNetworkFromBitcoinNetwork(this.bitcoinConfig.network);
            unlockTx = liquid.Transaction.fromHex(event.data.transactionData.transaction);
            isPayingToExternalAddress = event.data.outputs.length === 0;
            isSpendingFromContract = unlockTx.ins.find(i => i.hash.equals(liquid.Transaction.fromBuffer(swap.lockTx!).getHash())) != null;
            const sweepScript = liquid.address.toOutputScript(swap.sweepAddress, network);
            isPayingToSweepAddress = unlockTx.outs.some(o => o.script.equals(sweepScript));
        }

        assert(unlockTx != null, 'There was a problem building the unlock transaction');

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

    async processNewBlock(event: NBXplorerBlockEvent, cryptoCode: Chain): Promise<void> {
        const { swap } = this;
        if (swap.chain !== cryptoCode) {
            return;
        }
        this.logger.debug(`Processing new block ${event.data.height} (swap=${this.swap})`);
        if ((swap.status === 'CONTRACT_FUNDED' || swap.status === 'CONTRACT_FUNDED_UNCONFIRMED' || swap.status === 'CONTRACT_AMOUNT_MISMATCH')
            && swap.timeoutBlockHeight <= event.data.height) {
            swap.status = 'CONTRACT_EXPIRED';
            this.swap = await this.repository.save(swap);
            void this.onStatusChange('CONTRACT_EXPIRED');
        } else if ((swap.status === 'CONTRACT_AMOUNT_MISMATCH_UNCONFIRMED') && this.bitcoinService.hasEnoughConfirmations(swap.lockTxHeight, event.data.height)) {
            swap.status = 'CONTRACT_AMOUNT_MISMATCH';
            this.swap = await this.repository.save(swap);
            void this.onStatusChange('CONTRACT_AMOUNT_MISMATCH');
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

    async buildLiquidClaimTx(swap: SwapIn, spendingTx: liquid.Transaction): Promise<liquid.Transaction> {
        const network = getLiquidNetworkFromBitcoinNetwork(this.bitcoinConfig.network);
        const psetBuilder = new LiquidClaimPSETBuilder(this.nbxplorer, this.elementsConfig, network);
        const pset = await psetBuilder.getPset(swap, spendingTx, swap.sweepAddress);
        const signer = new liquid.Signer(pset);
        const finalizer = new liquid.Finalizer(pset);
        const signingKeyPair = ECPair.fromPrivateKey(swap.unlockPrivKey);
        for (const [index, input] of pset.inputs.entries()) {
            const signature = psetBuilder.signIndex(pset, signer, signingKeyPair, index, liquid.Transaction.SIGHASH_ALL);
            const stack = [signature, Buffer.from(swap.preImage!), input.witnessScript!];
            psetBuilder.finalizeIndexWithStack(finalizer, index, stack);
        }
        const psetTx = liquid.Extractor.extract(pset);
        return psetTx;
    }
}
