import { SwapInRequest, SwapOutRequest } from '@40swap/shared';
import { SwapInRunner } from './SwapInRunner.js';
import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { decode,  } from 'bolt11';
import assert from 'node:assert';
import { reverseSwapScript, swapScript } from './bitcoin-utils.js';
import { payments } from 'bitcoinjs-lib';
import { SwapIn } from './entities/SwapIn.js';
import Decimal from 'decimal.js';
import { BitcoinConfigurationDetails, BitcoinService } from './BitcoinService.js';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import { NBXplorerBlockEvent, NBXplorerNewTransactionEvent, NbxplorerService } from './NbxplorerService.js';
import { DataSource, In, Not } from 'typeorm';
import { LndService } from './LndService.js';
import { OnEvent } from '@nestjs/event-emitter';
import { SwapOutRunner } from './SwapOutRunner.js';
import { SwapOut } from './entities/SwapOut.js';
import { base58Id } from './utils.js';

const ECPair = ECPairFactory(ecc);

@Injectable()
export class SwapService implements OnApplicationBootstrap, OnApplicationShutdown {
    private readonly logger = new Logger(SwapService.name);
    private readonly runningSwaps: Map<string, SwapInRunner|SwapOutRunner>;

    constructor(
        private bitcoinConfig: BitcoinConfigurationDetails,
        private bitcoinService: BitcoinService,
        private nbxplorer: NbxplorerService,
        private dataSource: DataSource,
        private lnd: LndService,
    ) {
        this.runningSwaps = new Map();
    }

    async createSwapIn(request: SwapInRequest): Promise<SwapIn> {
        const { network } = this.bitcoinConfig;
        const { tags, satoshis } = decode(request.invoice); // TODO validate network
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

        const repository = this.dataSource.getRepository(SwapIn);
        const swap = await repository.save({
            id: base58Id(),
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
        const runner = new SwapInRunner(
            swap,
            repository,
            this.bitcoinConfig,
            this.bitcoinService,
            this.nbxplorer,
            this.lnd,
        );
        this.logger.log(`Starting swap ${swap.id}`);
        this.runAndMonitor(swap, runner);
        return swap;
    }

    async createSwapOut(request: SwapOutRequest): Promise<SwapOut> {
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
        const repository = this.dataSource.getRepository(SwapOut);
        const swap = await repository.save({
            id: base58Id(),
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
        const runner = new SwapOutRunner(
            swap,
            repository,
            this.bitcoinConfig,
            this.bitcoinService,
            this.nbxplorer,
            this.lnd,
        );
        this.runAndMonitor(swap, runner);
        return swap;
    }

    private async runAndMonitor(swap: SwapIn|SwapOut, runner: SwapInRunner|SwapOutRunner): Promise<void> {
        this.runningSwaps.set(swap.id, runner);
        await runner.run();
        this.logger.log(`Swap ${swap.id} finished`);
        this.runningSwaps.delete(swap.id);
    }

    @OnEvent('nbxplorer.newblock')
    private async processNewBlock(event: NBXplorerBlockEvent): Promise<void> {
        const promises = Array.from(this.runningSwaps.values()).map(runner => runner.processNewBlock(event));
        await Promise.all(promises);
    }

    @OnEvent('nbxplorer.newtransaction')
    private async processNewTransaction(event: NBXplorerNewTransactionEvent): Promise<void> {
        const promises = Array.from(this.runningSwaps.values()).map(runner => runner.processNewTransaction(event));
        await Promise.all(promises);
    }

    async onApplicationBootstrap(): Promise<void> {
        const swapInRepository = this.dataSource.getRepository(SwapIn);
        const swapOutRepository = this.dataSource.getRepository(SwapOut);
        const resumableSwapIns = await swapInRepository.findBy({
            status: Not(In(['CLAIMED', 'REFUNDED'])),
        });
        const resumableSwapOuts = await swapOutRepository.findBy({
            status: Not(In(['CLAIMED', 'REFUNDED'])),
        });
        for (const swap of [...resumableSwapIns, ...resumableSwapOuts]) {
            const runner =  swap instanceof SwapIn ? new SwapInRunner(
                swap,
                swapInRepository,
                this.bitcoinConfig,
                this.bitcoinService,
                this.nbxplorer,
                this.lnd,
            ) : new SwapOutRunner(
                swap,
                swapOutRepository,
                this.bitcoinConfig,
                this.bitcoinService,
                this.nbxplorer,
                this.lnd,
            );
            this.logger.log(`Resuming swap ${swap.id}`);
            this.runAndMonitor(swap, runner);
        }
    }

    async onApplicationShutdown(): Promise<void> {
        for (const [id, runner] of this.runningSwaps.entries()) {
            this.logger.log(`Pausing swap ${id}`);
            await runner.stop();
        }
    }
}