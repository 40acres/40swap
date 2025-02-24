import { getSwapInInputAmount, getSwapOutOutputAmount, SwapInRequest, SwapOutRequest } from '@40swap/shared';
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
import { Psbt } from 'liquidjs-lib/src/psbt.js';
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

    /**
 * Initiates a Lightning to Liquid atomic swap:
 * - Receives the destination Liquid address and the amount in satoshis.
 * - Generates a secret and its hash.
 * - Creates a HODL invoice in LND.
 * - Constructs an HTLC in Liquid without requiring the recipient's public key.
 *
 * @param amount Invoice amount in satoshis.
 * @param recipientAddress Liquid address to receive the funds.
 */
    async initiateLightningToLiquidSwap(
        amount: number,
        recipientAddress: string,
    ): Promise<any> {
        // 1. Generate the secret and calculate the hash (using SHA256)
        const secret = randomBytes(32);
        const hash = createHash('sha256').update(secret).digest();
        this.logger.debug(`Secret: ${secret.toString('hex')}`);
        this.logger.debug(`Hash: ${hash.toString('hex')}`);

        // 2. Create a HODL invoice in LND
        const expiry = 3600; // 1-hour expiration
        const invoice = await this.lnd.addHodlInvoice({
            hash,
            amount,
            expiry,
        });
        this.logger.debug(`Created hodl invoice: ${invoice}`);

        // 3. Construct the HTLC in Liquid without requiring the recipient's pubkey
        const network = liquidNetwork;
        // Generate only the refund key pair randomly
        const refundKeyPair = ECPair.makeRandom({ network });
        const refundPubKey = refundKeyPair.publicKey;
        // Define locktime (e.g., block number or timestamp)
        const locktime = 500000;
        const OPS = liquid.script.OPS;
        // Modified HTLC:
        // Redemption branch: must present the secret that produces the correct hash.
        // Instead of a signature verification, OP_TRUE is used, so any actor with the secret can redeem.
        // Refund branch: after the locktime, funds can be recovered using the refund signature.
        const htlcScript = liquid.script.compile([
            OPS.OP_IF,
            OPS.OP_SHA256,
            hash,
            OPS.OP_EQUALVERIFY,
            OPS.OP_TRUE, // No signature required to redeem (security note)
            OPS.OP_ELSE,
            liquid.script.number.encode(locktime),
            OPS.OP_CHECKLOCKTIMEVERIFY,
            OPS.OP_DROP,
            refundPubKey,
            OPS.OP_CHECKSIG,
            OPS.OP_ENDIF,
        ]);
        const p2sh = liquid.payments.p2sh({
            redeem: { output: htlcScript, network },
            network,
        });

        // Return the necessary data to coordinate the swap
        return {
            invoice, // HODL invoice for the Lightning side
            secret: secret.toString('hex'),
            hash: hash.toString('hex'),
            liquidHtlcAddress: p2sh.address, // Address where funds will be locked in Liquid
            htlcScript: htlcScript.toString('hex'),
            recipientAddress, // Provided destination address
            refundPubKey: refundPubKey.toString('hex'),
            locktime,
            amount,
        };
    }

    /**
     * Redeems the swap in Liquid using the provided secret.
     * `swapDetails` is expected to contain the necessary information:
     * - fundingTxId: txid of the transaction funding the HTLC.
     * - vout: output index.
     * - fundingValue: output value.
     * - asset: asset hash.
     * - htlcP2shOutput: script of the HTLC P2SH address.
     * - htlcScript: the original HTLC script.
     * - recipientAddress: destination address to receive the funds.
     *
     * @param secretHex Secret in hexadecimal.
     * @param swapDetails Swap details.
     */
    async redeemSwap(secretHex: string, swapDetails: any): Promise<string> {
        // Validate that the secret matches the hash
        const secret = Buffer.from(secretHex, 'hex');
        const computedHash = createHash('sha256').update(secret).digest('hex');
        if (computedHash !== swapDetails.hash) {
            throw new Error('The provided secret is invalid');
        }

        // Construct the redemption transaction in Liquid (simplified example)
        const network = liquid.networks.liquid;
        const psbt = new Psbt({ network });

        psbt.addInput({
            hash: swapDetails.fundingTxId, // funding txid
            index: swapDetails.vout,       // output index
            witnessUtxo: {
                value: swapDetails.fundingValue,
                asset: swapDetails.asset,
                script: Buffer.from(swapDetails.htlcP2shOutput, 'hex'),
                nonce: Buffer.alloc(32), // confidentiality nonce
            },
        });

        // Add an output sending the funds to the destination address
        psbt.addOutput({
            address: swapDetails.recipientAddress,
            value: swapDetails.fundingValue,
            asset: swapDetails.asset,
            nonce: Buffer.alloc(32),
            script: Buffer.alloc(0),
        });

        // To redeem, use the OP_IF branch of the HTLC by providing:
        // [secret, <activator for OP_IF>, htlcScript]
        // Use Buffer.from([1]) as the activator (true) for the redemption branch.
        psbt.finalizeInput(0, () => {
            return {
                finalScriptWitness: liquid.script.witness.compile([
                    secret,
                    Buffer.from([1]),
                    Buffer.from(swapDetails.htlcScript, 'hex'),
                ]),
            };
        });
        const tx = psbt.extractTransaction();

        // In production, broadcast the transaction to the Liquid network.
        return tx.toHex();
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