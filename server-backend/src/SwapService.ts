import { getSwapInInputAmount, getSwapOutOutputAmount, IntiateSwapFromLNToLQResponse, RedeemSwapFromLNToLQRequest, SwapChainRequest, SwapInRequest, SwapOutRequest } from '@40swap/shared';
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
import { SwapOutRunner } from './SwapOutRunner.js';
import { SwapOut } from './entities/SwapOut.js';
import { base58Id } from './utils.js';
import { ConfigService } from '@nestjs/config';
import { FourtySwapConfiguration } from './configuration.js';
import { payments as liquidPayments } from 'liquidjs-lib';
import { bitcoin } from 'bitcoinjs-lib/src/networks.js';
import { liquid as liquidNetwork, regtest as liquidRegtest } from 'liquidjs-lib/src/networks.js';
import * as liquid from 'liquidjs-lib';
import { Psbt, witnessStackToScriptWitness } from 'liquidjs-lib/src/psbt.js';
import { randomBytes, createHash } from 'crypto';

const ECPair = ECPairFactory(ecc);

@Injectable()
export class SwapService implements OnApplicationBootstrap, OnApplicationShutdown {
    private readonly logger = new Logger(SwapService.name);
    private readonly runningSwaps: Map<string, SwapInRunner | SwapOutRunner>;
    private readonly swapConfig: FourtySwapConfiguration['swap'];

    constructor(
        private bitcoinConfig: BitcoinConfigurationDetails,
        private bitcoinService: BitcoinService,
        private nbxplorer: NbxplorerService,
        private dataSource: DataSource,
        private lnd: LndService,
        config: ConfigService<FourtySwapConfiguration>,
    ) {
        this.runningSwaps = new Map();
        this.swapConfig = config.getOrThrow('swap', { infer: true });
    }

    async createSwapIn(request: SwapInRequest): Promise<SwapIn> {
        if (request.chain !== 'BITCOIN') {
            throw new Error('not implemented'); // TODO
        }
        const { network } = this.bitcoinConfig;
        const { tags, satoshis, network: invoiceNetwork } = decode(request.invoice);
        if (invoiceNetwork == null || invoiceNetwork.bech32 !== network.bech32) {
            throw new BadRequestException('invalid bitcoin network');
        }
        const hashTag = tags.find(t => t.tagName === 'payment_hash');
        assert(hashTag);
        assert(typeof hashTag.data === 'string');
        assert(satoshis != null);
        const paymentHash = hashTag.data;

        const outputAmount = new Decimal(satoshis).div(1e8).toDecimalPlaces(8);
        if (outputAmount.lt(this.swapConfig.minimumAmount) || outputAmount.gt(this.swapConfig.maximumAmount)) {
            throw new BadRequestException(`invalid amount ${outputAmount.toNumber()}`);
        }
        const timeoutBlockHeight = (await this.bitcoinService.getBlockHeight()) + this.swapConfig.lockBlockDelta.in;
        const claimKey = ECPair.makeRandom();
        const counterpartyPubKey = Buffer.from(request.refundPublicKey, 'hex');
        const lockScript = swapScript(
            Buffer.from(paymentHash, 'hex'),
            claimKey.publicKey,
            counterpartyPubKey,
            timeoutBlockHeight,
        );
        let address: string | undefined;
        if (request.chain === 'BITCOIN') {
            address = payments.p2wsh({ network, redeem: { output: lockScript, network } }).address;
            assert(address);
            await this.nbxplorer.trackAddress(address);
        } else if (request.chain === 'LIQUID') {
            const liquidNetworkToUse = network === bitcoin ? liquidNetwork : liquidRegtest;
            address = liquidPayments.p2wsh({
                network: liquidNetworkToUse,
                redeem: {
                    output: lockScript,
                    network: liquidNetworkToUse,
                },
                blindkey: undefined, // TODO
            }).address;
        }
        assert(address);

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
            sweepAddress: await this.lnd.getNewAddress(),
            timeoutBlockHeight,
            lockTx: null,
            unlockTx: null,
            preImage: null,
            outcome: null,
            lockTxHeight: 0,
            unlockTxHeight: 0,
        } satisfies Omit<SwapIn, 'createdAt' | 'modifiedAt'>);
        const runner = new SwapInRunner(
            swap,
            repository,
            this.bitcoinConfig,
            this.bitcoinService,
            this.nbxplorer,
            this.lnd,
            this.swapConfig,
        );
        this.runAndMonitor(swap, runner);
        return swap;
    }

    async createSwapOut(request: SwapOutRequest): Promise<SwapOut> {
        if (request.chain !== 'BITCOIN') {
            throw new Error('not implemented'); // TODO
        }
        const preImageHash = Buffer.from(request.preImageHash, 'hex');
        const inputAmount = new Decimal(request.inputAmount);
        if (inputAmount.lt(this.swapConfig.minimumAmount) || inputAmount.gt(this.swapConfig.maximumAmount)) {
            throw new BadRequestException('invalid amount');
        }

        const invoice = await this.lnd.addHodlInvoice({
            hash: preImageHash,
            amount: inputAmount.mul(1e8).toDecimalPlaces(0).toNumber(),
            expiry: this.swapConfig.expiryDuration.asSeconds(),
        });

        const refundKey = ECPair.makeRandom();
        const sweepAddress = await this.lnd.getNewAddress();
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
        } satisfies Omit<SwapOut, 'createdAt' | 'modifiedAt'>);
        const runner = new SwapOutRunner(
            swap,
            repository,
            this.bitcoinConfig,
            this.bitcoinService,
            this.nbxplorer,
            this.lnd,
            this.swapConfig,
        );
        this.runAndMonitor(swap, runner);
        return swap;
    }

    async initiateLightningToLiquidSwap(request: SwapChainRequest): Promise<IntiateSwapFromLNToLQResponse> {
        const preImageHash = Buffer.from(request.preImageHash, 'hex');
        const inputAmount = new Decimal(request.inputAmount);
        if (inputAmount.lt(this.swapConfig.minimumAmount) || inputAmount.gt(this.swapConfig.maximumAmount)) {
            throw new BadRequestException('invalid amount');
        }
        const invoice = await this.lnd.addHodlInvoice({
            hash: preImageHash,
            amount: inputAmount.mul(1e8).toDecimalPlaces(0).toNumber(),
            expiry: this.swapConfig.expiryDuration.asSeconds(),
        });

        const network = liquidNetwork;
        // TODO: Ask for refund address (?) -> NBExplorer en liquid mode for a new address not used (HOT)
        const refundKeyPair = ECPair.makeRandom({ network });
        const refundPubKey = refundKeyPair.publicKey;

        const timeoutBlockHeight = (await this.bitcoinService.getBlockHeight()) + this.swapConfig.lockBlockDelta.in;
        const htlcScript = liquid.script.compile([
            liquid.script.OPS.OP_SIZE,
            liquid.script.number.encode(32),
            liquid.script.OPS.OP_EQUAL,
            liquid.script.OPS.OP_IF,
              liquid.script.OPS.OP_HASH160,
              liquid.crypto.ripemd160(preImageHash),
              liquid.script.OPS.OP_EQUALVERIFY,
              Buffer.from(request.destinationAddress, 'hex'),
            liquid.script.OPS.OP_ELSE,
              liquid.script.OPS.OP_DROP,
              liquid.script.number.encode(timeoutBlockHeight),
              liquid.script.OPS.OP_CHECKLOCKTIMEVERIFY,
              liquid.script.OPS.OP_DROP,
              refundPubKey,
            liquid.script.OPS.OP_ENDIF,
            liquid.script.OPS.OP_CHECKSIG,
          ]);

        const p2wsh = liquid.payments.p2wsh({
            redeem: { output: htlcScript, network },
            network,
        });

        return {
            invoice,
            hash: preImageHash.toString('hex'),
            liquidHtlcAddress: String(p2wsh.address),
            htlcScript: htlcScript.toString('hex'),
            recipientAddress: request.destinationAddress,
            refundPubKey: refundPubKey.toString('hex'),
            locktime: timeoutBlockHeight,
            amount: request.inputAmount,
        };
    }

    async claimTx(request: RedeemSwapFromLNToLQRequest): Promise<string> {
        const preimage = Buffer.from(request.hash, 'hex');
        const destinationKeyPair = request.recipientAddress;
        if (!destinationKeyPair) {
            throw new Error("Destination key pair is required.");
        }
        // const utxo = await this.getUtxoForAddress(request.liquidHtlcAddress);
        // if (!utxo) {
        //     throw new Error("No se encontró un UTXO para la dirección HTLC.");
        // }
        const pset = new liquid.Pset();
        return pset.toBase64();
    }

    private async runAndMonitor(swap: SwapIn | SwapOut, runner: SwapInRunner | SwapOutRunner): Promise<void> {
        this.logger.log(`Starting swap (id=${swap.id})`);
        this.runningSwaps.set(swap.id, runner);
        await runner.run();
        this.logger.log(`Swap finished (id=${swap.id})`);
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
            status: Not('DONE'),
        });
        const resumableSwapOuts = await swapOutRepository.findBy({
            status: Not('DONE'),
        });
        for (const swap of [...resumableSwapIns, ...resumableSwapOuts]) {
            const runner = swap instanceof SwapIn ? new SwapInRunner(
                swap,
                swapInRepository,
                this.bitcoinConfig,
                this.bitcoinService,
                this.nbxplorer,
                this.lnd,
                this.swapConfig,
            ) : new SwapOutRunner(
                swap,
                swapOutRepository,
                this.bitcoinConfig,
                this.bitcoinService,
                this.nbxplorer,
                this.lnd,
                this.swapConfig,
            );
            this.logger.log(`Resuming swap (id=${swap.id})`);
            this.runAndMonitor(swap, runner);
        }
    }

    async onApplicationShutdown(): Promise<void> {
        for (const [id, runner] of this.runningSwaps.entries()) {
            this.logger.log(`Pausing swap (id=${id})`);
            await runner.stop();
        }
    }
}