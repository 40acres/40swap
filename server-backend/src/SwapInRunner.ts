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

const ECPair = ECPairFactory(ecc);

export class SwapInRunner {
    private readonly logger = new Logger(SwapInRunner.name);
    private runningPromise: Promise<void>;
    private notifyFinished!: () => void;

    constructor(
        private swap: SwapIn,
        private repository: Repository<SwapIn>,
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
        return this.runningPromise;
    }

    stop(): Promise<void> {
        // TODO handle pause
        this.notifyFinished();
        return this.runningPromise;
    }

    private async onStatusChange(status: SwapInStatus): Promise<void> {
        if (status === 'CONTRACT_FUNDED') {
            this.swap.preImage = await this.lnd.sendPayment(this.swap.invoice);
            this.swap.status = 'INVOICE_PAID';
            await this.repository.save(this.swap);
            this.onStatusChange('INVOICE_PAID');
        } else if (status === 'INVOICE_PAID') {
            const claimTx = this.buildClaimTx(
                this.swap,
                Transaction.fromBuffer(this.swap.lockTx!),
                await this.bitcoinService.getMinerFeeRate('low_prio'),
            );
            await this.nbxplorer.broadcastTx(claimTx);
            // TODO change status by listening to the blockchain
            this.swap.status = 'CLAIMED';
            await this.repository.save(this.swap);
            this.onStatusChange('CLAIMED');
        } else if (status === 'CLAIMED') {
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
        const { swap } = this;
        if (this.swap.status !== 'CREATED') {
            console.log(`swap in bad state ${swap.status}`);
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
        this.swap = await this.repository.save(swap);
        await this.onStatusChange('CONTRACT_FUNDED');
    }

    private async processContractSpendingTx(event: NBXplorerNewTransactionEvent): Promise<void> {
        const { swap } = this;
        assert(swap.lockTx != null);

        const unlockTx = Transaction.fromHex(event.data.transactionData.transaction);
        const isPayingToExternalAddress = event.data.outputs.length === 0; // nbxplorer does not list outputs if it's spending a tracking utxo
        const isSpendingFromContract = unlockTx.ins.find(i => i.hash.equals(Transaction.fromBuffer(swap.lockTx!).getHash())) != null;
        const isPayingToSweepAddress = unlockTx.outs.find(o => {
            try {
                return address.fromOutputScript(o.script) === swap.sweepAddress;
            } catch (e) {
                return false;
            }
        }) != null;

        swap.unlockTx = unlockTx.toBuffer();
        this.swap = await this.repository.save(swap);
        if (isSpendingFromContract && isPayingToExternalAddress && !isPayingToSweepAddress) {
            if (this.swap.status !== 'CONTRACT_EXPIRED') {
                console.log(`swap in bad state ${swap.status}`);
                return;
            }
            swap.status = 'REFUNDED';
            this.swap = await this.repository.save(swap);
            await this.onStatusChange('REFUNDED');
        }
    }

    async processNewBlock(event: NBXplorerBlockEvent): Promise<void> {
        const { swap } = this;
        if (swap.status === 'CONTRACT_FUNDED'  && swap.timeoutBlockHeight <= event.data.height) {
            swap.status = 'CONTRACT_EXPIRED';
            this.swap = await this.repository.save(swap);
            await this.onStatusChange('CONTRACT_EXPIRED');
        }
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
                    key: ECPair.fromPrivateKey(swap.unlockPrivKey),
                    network: this.bitcoinConfig.network,
                    preImage: swap.preImage!,
                });
                return psbt;
            },
        ).extractTransaction();
    }

}