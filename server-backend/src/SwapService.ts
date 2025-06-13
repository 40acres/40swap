import { Chain, getSwapInInputAmount, getSwapOutOutputAmount, SwapInRequest, SwapOutRequest, SwapType } from '@40swap/shared';
import { SwapInRunner } from './SwapInRunner.js';
import { BadRequestException, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { decode } from 'bolt11';
import assert from 'node:assert';
import { swapScript } from './bitcoin-utils.js';
import { payments } from 'bitcoinjs-lib';
import { SwapIn } from './entities/SwapIn.js';
import Decimal from 'decimal.js';
import { BitcoinConfigurationDetails, BitcoinService } from './BitcoinService.js';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import { NBXplorerBlockEvent, NBXplorerNewTransactionEvent, NbxplorerService } from './NbxplorerService.js';
import { DataSource, Not } from 'typeorm';
import { LndService } from './LndService.js';
import { OnEvent } from '@nestjs/event-emitter';
import { BLOCKS_BETWEEN_CLTV_AND_SWAP_EXPIRATIONS, SwapOutRunner } from './SwapOutRunner.js';
import { SwapOut } from './entities/SwapOut.js';
import { base58Id } from './utils.js';
import { ConfigService } from '@nestjs/config';
import { FortySwapConfiguration } from './configuration.js';
import { payments as liquidPayments } from 'liquidjs-lib';
import { LiquidService } from './LiquidService.js';
import { getLiquidNetworkFromBitcoinNetwork } from '@40swap/shared';

const ECPair = ECPairFactory(ecc);

@Injectable()
export class SwapService implements OnApplicationBootstrap, OnApplicationShutdown {
    private readonly logger = new Logger(SwapService.name);
    private readonly runningSwaps: Map<string, SwapInRunner | SwapOutRunner>;
    private readonly swapConfig: FortySwapConfiguration['swap'];
    private readonly elementsConfig?: FortySwapConfiguration['elements'];

    constructor(
        private bitcoinConfig: BitcoinConfigurationDetails,
        private bitcoinService: BitcoinService,
        private liquidService: LiquidService,
        private nbxplorer: NbxplorerService,
        private dataSource: DataSource,
        private lnd: LndService,
        config: ConfigService<FortySwapConfiguration>,
    ) {
        this.runningSwaps = new Map();
        this.swapConfig = config.getOrThrow('swap', { infer: true });
        try {
            this.elementsConfig = config.get('elements', { infer: true });
        } catch (error) {
            this.logger.warn('Elements configuration not found. Liquid functionality will be disabled.');
        }
    }

    getCheckedAmount(amount: Decimal): Decimal {
        if (amount.lt(this.swapConfig.minimumAmount) || amount.gt(this.swapConfig.maximumAmount)) {
            throw new BadRequestException('invalid amount');
        }
        return amount;
    }

    async createSwapIn(request: SwapInRequest): Promise<SwapIn> {
        const { network } = this.bitcoinConfig;
        const { tags, satoshis, network: invoiceNetwork } = decode(request.invoice);
        if (invoiceNetwork == null || invoiceNetwork.bech32 !== network.bech32) {
            throw new BadRequestException('invalid bitcoin network');
        }
        const hashTag = tags.find((t) => t.tagName === 'payment_hash');
        assert(hashTag);
        assert(typeof hashTag.data === 'string');
        assert(satoshis != null);
        const paymentHash = hashTag.data;
        let blindingPrivKey: Buffer | null = null;

        const outputAmount = this.getCheckedAmount(new Decimal(satoshis).div(1e8).toDecimalPlaces(8));
        /**
         * The lockBlockDeltaIn parameter specifies a custom CLTV expiry (in blocks) for the swap.
         * If not provided, the default value from the swap configuration is used.
         */
        const lockBlockDeltaIn = request.lockBlockDeltaIn ?? this.swapConfig.lockBlockDelta.in;
        if (lockBlockDeltaIn < this.swapConfig.lockBlockDelta.minIn) {
            throw new BadRequestException(`lockBlockDeltaIn must be at least ${this.swapConfig.lockBlockDelta.minIn} blocks`);
        }
        let timeoutBlockHeight = (await this.bitcoinService.getBlockHeight()) + lockBlockDeltaIn;
        if (request.chain === 'LIQUID') {
            assert(this.liquidService.xpub != null, 'liquid is not available');
            timeoutBlockHeight = (await this.nbxplorer.getNetworkStatus('lbtc')).chainHeight + lockBlockDeltaIn * 10;
        }
        const claimKey = ECPair.makeRandom();
        const counterpartyPubKey = Buffer.from(request.refundPublicKey, 'hex');
        const lockScript = swapScript(Buffer.from(paymentHash, 'hex'), claimKey.publicKey, counterpartyPubKey, timeoutBlockHeight);
        let address: string | undefined;
        let sweepAddress: string | undefined;
        if (request.chain === 'BITCOIN') {
            address = payments.p2wsh({ network, redeem: { output: lockScript, network } }).address;
            assert(address);
            await this.nbxplorer.trackAddress(address);
            sweepAddress = await this.lnd.getNewAddress();
        } else if (request.chain === 'LIQUID') {
            assert(this.liquidService.xpub != null, 'liquid is not available');
            const blindingKeyPair = ECPair.makeRandom();
            blindingPrivKey = blindingKeyPair.privateKey!;
            const liquidNetworkToUse = getLiquidNetworkFromBitcoinNetwork(network);
            const response = await this.nbxplorer.getUnusedAddress(this.liquidService.xpub, 'lbtc', { reserve: true });
            sweepAddress = response.address;
            const payment = liquidPayments.p2wsh({
                network: liquidNetworkToUse,
                redeem: {
                    output: lockScript,
                    network: liquidNetworkToUse,
                },
                blindkey: blindingKeyPair.publicKey,
            });
            assert(payment.confidentialAddress);
            assert(payment.address);
            address = payment.confidentialAddress;
            await this.nbxplorer.trackAddress(payment.address, 'lbtc');
        }
        assert(address);
        assert(sweepAddress);
        const repository = this.dataSource.getRepository(SwapIn);
        const swap = await repository.save({
            id: base58Id(),
            chain: request.chain,
            contractAddress: address,
            invoice: request.invoice,
            lockScript,
            unlockPrivKey: claimKey.privateKey!,
            counterpartyPubKey,
            inputAmount: getSwapInInputAmount(outputAmount, new Decimal(this.swapConfig.feePercentage)).toDecimalPlaces(8),
            outputAmount,
            status: 'CREATED',
            sweepAddress,
            timeoutBlockHeight,
            lockTx: null,
            unlockTx: null,
            preImage: null,
            outcome: null,
            lockTxHeight: 0,
            unlockTxHeight: 0,
            blindingPrivKey,
        } satisfies Omit<SwapIn, 'createdAt' | 'modifiedAt'>);
        const runner = new SwapInRunner(
            swap,
            repository,
            this.bitcoinConfig,
            this.bitcoinService,
            this.nbxplorer,
            this.lnd,
            this.swapConfig,
            this.liquidService,
        );
        this.runAndMonitor('in', swap, runner);
        return swap;
    }

    async createSwapOut(request: SwapOutRequest): Promise<SwapOut> {
        let sweepAddress: string | null = null;
        let blindingPrivKey: Buffer | null = null;
        if (request.chain === 'BITCOIN') {
            sweepAddress = await this.lnd.getNewAddress();
        }
        if (request.chain === 'LIQUID') {
            assert(this.liquidService.xpub != null, 'liquid is not available');
            sweepAddress = (await this.nbxplorer.getUnusedAddress(this.liquidService.xpub, 'lbtc', { reserve: true })).address;
            blindingPrivKey = ECPair.makeRandom().privateKey!;
        }
        assert(sweepAddress, 'Could not create sweep address for requested chain');
        const preImageHash = Buffer.from(request.preImageHash, 'hex');
        const inputAmount = this.getCheckedAmount(new Decimal(request.inputAmount));
        const cltvExpiry = this.swapConfig.lockBlockDelta.out + BLOCKS_BETWEEN_CLTV_AND_SWAP_EXPIRATIONS;
        const invoice = await this.lnd.addHodlInvoice({
            hash: preImageHash,
            amount: inputAmount.mul(1e8).toDecimalPlaces(0).toNumber(),
            expiry: this.swapConfig.expiryDuration.asSeconds(),
            cltvExpiry,
        });
        const refundKey = ECPair.makeRandom();
        const repository = this.dataSource.getRepository(SwapOut);
        const swap = await repository.save({
            id: base58Id(),
            chain: request.chain,
            contractAddress: null,
            inputAmount,
            outputAmount: getSwapOutOutputAmount(inputAmount, new Decimal(this.swapConfig.feePercentage)).toDecimalPlaces(8),
            lockScript: null,
            status: 'CREATED',
            preImageHash,
            invoice,
            timeoutBlockHeight: 0,
            sweepAddress,
            unlockPrivKey: refundKey.privateKey!,
            counterpartyPubKey: Buffer.from(request.claimPubKey, 'hex'),
            unlockTx: null,
            preImage: null,
            lockTx: null,
            outcome: null,
            lockTxHeight: 0,
            unlockTxHeight: 0,
            blindingPrivKey,
        } satisfies Omit<SwapOut, 'createdAt' | 'modifiedAt'>);
        const runner = new SwapOutRunner(
            swap,
            repository,
            this.bitcoinConfig,
            this.bitcoinService,
            this.nbxplorer,
            this.lnd,
            this.swapConfig,
            this.liquidService,
        );
        this.runAndMonitor('out', swap, runner);
        return swap;
    }

    private async runAndMonitor(type: SwapType, swap: SwapIn | SwapOut, runner: SwapInRunner | SwapOutRunner): Promise<void> {
        this.logger.log(`Starting swap-${type} (id=${swap.id})`);
        this.runningSwaps.set(swap.id, runner);
        await runner.run();
        this.logger.log(`Swap-${type} finished (id=${swap.id})`);
        this.runningSwaps.delete(swap.id);
    }

    @OnEvent('nbxplorer.newblock')
    private async processNewBlock(event: NBXplorerBlockEvent, cryptoCode: Chain): Promise<void> {
        const promises = Array.from(this.runningSwaps.values()).map((runner) => runner.processNewBlock(event, cryptoCode));
        await Promise.all(promises);
    }

    @OnEvent('nbxplorer.newtransaction')
    private async processNewTransaction(event: NBXplorerNewTransactionEvent, cryptoCode: Chain): Promise<void> {
        const promises = Array.from(this.runningSwaps.values()).map((runner) => runner.processNewTransaction(event, cryptoCode));
        await Promise.all(promises);
    }

    async onApplicationBootstrap(): Promise<void> {
        // Resume existing swaps
        const swapInRepository = this.dataSource.getRepository(SwapIn);
        const swapOutRepository = this.dataSource.getRepository(SwapOut);
        const resumableSwapIns = await swapInRepository.findBy({
            status: Not('DONE'),
        });
        const resumableSwapOuts = await swapOutRepository.findBy({
            status: Not('DONE'),
        });
        for (const swap of [...resumableSwapIns, ...resumableSwapOuts]) {
            const runner =
                swap instanceof SwapIn
                    ? new SwapInRunner(
                          swap,
                          swapInRepository,
                          this.bitcoinConfig,
                          this.bitcoinService,
                          this.nbxplorer,
                          this.lnd,
                          this.swapConfig,
                          this.liquidService,
                      )
                    : new SwapOutRunner(
                          swap,
                          swapOutRepository,
                          this.bitcoinConfig,
                          this.bitcoinService,
                          this.nbxplorer,
                          this.lnd,
                          this.swapConfig,
                          this.liquidService,
                      );
            this.logger.log(`Resuming swap (id=${swap.id})`);
            this.runAndMonitor(swap instanceof SwapIn ? 'in' : 'out', swap, runner);
        }
    }

    async onApplicationShutdown(): Promise<void> {
        for (const [id, runner] of this.runningSwaps.entries()) {
            this.logger.log(`Pausing swap (id=${id})`);
            await runner.stop();
        }
    }
}
