import { DockerComposeEnvironment, StartedDockerComposeEnvironment, Wait } from 'testcontainers';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import { signContractSpend, SwapOutcome, SwapInStatus } from '@40swap/shared';
import { Lnd } from './Lnd';
import { Bitcoind } from './Bitcoind';
import { Elements } from './Elements';
import { BackendRestClient } from './BackendRestClient';
import { ECPair, waitFor, waitForChainSync } from './utils';
import { networks } from 'bitcoinjs-lib';
import { jest } from '@jest/globals';
import * as liquid from 'liquidjs-lib';
import { signLiquidPset } from '@40swap/shared';

jest.setTimeout(2 * 60 * 1000);

const network = networks.regtest;

describe('40Swap backend', () => {
    let compose: StartedDockerComposeEnvironment;
    let lndLsp: Lnd;
    let lndUser: Lnd;
    let lndAlice: Lnd;
    let bitcoind: Bitcoind;
    let elements: Elements;
    let backend: BackendRestClient;

    beforeAll(async () => {
        await setUpComposeEnvironment();
        await setUpBlockchains();
    });

    afterAll(async () => {
        await compose.down();
    });

    it('should complete a swap in', async () => {
        const refundKey = ECPair.makeRandom();
        const { paymentRequest, rHash } = await lndUser.createInvoice(0.0025);
        let swap = await backend.createSwapIn({
            chain: 'BITCOIN',
            invoice: paymentRequest!,
            refundPublicKey: refundKey.publicKey.toString('hex'),
        });
        expect(swap.status).toEqual<SwapInStatus>('CREATED');

        await bitcoind.sendToAddress(swap.contractAddress, swap.inputAmount);
        await waitFor(async () => (await backend.getSwapIn(swap.swapId)).status === 'CONTRACT_FUNDED_UNCONFIRMED');
        await bitcoind.mine();
        await waitFor(async () => (await backend.getSwapIn(swap.swapId)).status === 'CONTRACT_CLAIMED_UNCONFIRMED');
        await bitcoind.mine();
        await waitFor(async () => (await backend.getSwapIn(swap.swapId)).status === 'DONE');

        swap = await backend.getSwapIn(swap.swapId);
        expect(swap.outcome).toEqual<SwapOutcome>('SUCCESS');
        const invoice = await lndUser.lookupInvoice(rHash as Buffer);
        expect(invoice.state).toEqual('SETTLED');
    });

    it('should complete a liquid swap out', async () => {
        const randomBytes = crypto.randomBytes(32);
        const preImage = Buffer.from(randomBytes);
        const preImageHash = crypto.createHash('sha256').update(preImage).digest();
        const claimKey = ECPair.makeRandom();
        
        let swap = await backend.createSwapOut({
            chain: 'LIQUID',
            inputAmount: 0.002,
            claimPubKey: claimKey.publicKey.toString('hex'),
            preImageHash: preImageHash.toString('hex'),
        });
        expect(swap.status).toEqual('CREATED');

        lndUser.sendPayment(swap.invoice);
        await waitFor(async () => (await backend.getSwapOut(swap.swapId)).status === 'CONTRACT_FUNDED_UNCONFIRMED');
        
        await elements.mine(5);
        await waitFor(async () => (await backend.getSwapOut(swap.swapId)).status === 'CONTRACT_FUNDED');
        
        const claimAddress = await elements.getNewAddress();
        const claimPsbt = await backend.getClaimPsbt(swap.swapId, claimAddress);
        const pset = liquid.Pset.fromBase64(claimPsbt.psbt);
        signLiquidPset(pset, preImage.toString('hex'), claimKey);
        const transaction = liquid.Extractor.extract(pset);
        const signedTx = transaction.toHex();
        await backend.claimSwap(swap.swapId, signedTx);
        
        await elements.mine();
        await waitFor(async () => (await backend.getSwapOut(swap.swapId)).status === 'DONE');
        swap = await backend.getSwapOut(swap.swapId);
        expect(swap.outcome).toEqual<SwapOutcome>('SUCCESS');
    });

    it('should properly handle a liquid swap out expiration', async () => {
        const preImageHash = crypto.createHash('sha256').update(crypto.randomBytes(32)).digest();
        const claimKey = ECPair.makeRandom();
        
        // Create the swap
        let swap = await backend.createSwapOut({
            chain: 'LIQUID',
            inputAmount: 0.002,
            claimPubKey: claimKey.publicKey.toString('hex'),
            preImageHash: preImageHash.toString('hex'),
        });
        expect(swap.status).toEqual('CREATED');

        // Fund the invoice to start the swap
        lndUser.sendPayment(swap.invoice);
        await waitFor(async () => (await backend.getSwapOut(swap.swapId)).status === 'CONTRACT_FUNDED_UNCONFIRMED');
        
        // Wait for contract funding confirmation
        await elements.mine(5);
        await waitFor(async () => (await backend.getSwapOut(swap.swapId)).status === 'CONTRACT_FUNDED');
        
        // Get the current timeout block height
        swap = await backend.getSwapOut(swap.swapId);
        const timeoutBlockHeight = swap.timeoutBlockHeight;
        
        // Mine enough blocks to reach the timeout height
        const currentHeight = await elements.getBlockHeight();
        const blocksToMine = timeoutBlockHeight - currentHeight + 1;
        
        // Mine blocks to trigger expiration
        await elements.mine(blocksToMine);
        await waitFor(async () => (await backend.getSwapOut(swap.swapId)).status === 'CONTRACT_EXPIRED');
    });

    it('should complete a swap in with custom lockBlockDeltaIn', async () => {
        const refundKey = ECPair.makeRandom();
        const { paymentRequest, rHash } = await lndUser.createInvoice(0.0025);
        let swap = await backend.createSwapIn({
            chain: 'BITCOIN',
            invoice: paymentRequest!,
            refundPublicKey: refundKey.publicKey.toString('hex'),
            lockBlockDeltaIn: 500, // Custom CLTV expiry for testing
        });
        expect(swap.status).toEqual<SwapInStatus>('CREATED');

        await bitcoind.sendToAddress(swap.contractAddress, swap.inputAmount);
        await waitFor(async () => (await backend.getSwapIn(swap.swapId)).status === 'CONTRACT_FUNDED_UNCONFIRMED');
        await bitcoind.mine();
        await waitFor(async () => (await backend.getSwapIn(swap.swapId)).status === 'CONTRACT_CLAIMED_UNCONFIRMED');
        await bitcoind.mine();
        await waitFor(async () => (await backend.getSwapIn(swap.swapId)).status === 'DONE');

        swap = await backend.getSwapIn(swap.swapId);
        expect(swap.outcome).toEqual<SwapOutcome>('SUCCESS');
        const invoice = await lndUser.lookupInvoice(rHash as Buffer);
        expect(invoice.state).toEqual('SETTLED');
    });

    it('should fail if lockBlockDeltaIn is less than 144', async () => {
        const refundKey = ECPair.makeRandom();
        const { paymentRequest } = await lndUser.createInvoice(0.0025);
        await expect(
            backend.createSwapIn({
                chain: 'BITCOIN',
                invoice: paymentRequest!,
                refundPublicKey: refundKey.publicKey.toString('hex'),
                lockBlockDeltaIn: 100, // Less than the minimum allowed
            })
        ).rejects.toThrow('lockBlockDeltaIn must be at least 144 blocks');
    });

    it('should refund after timeout block height', async () => {
        const refundKey = ECPair.makeRandom();
        const { paymentRequest } = await lndUser.createInvoice(0.0025);
        const swap = await backend.createSwapIn({
            chain: 'BITCOIN',
            invoice: paymentRequest!,
            refundPublicKey: refundKey.publicKey.toString('hex'),
            lockBlockDeltaIn: 144, // Minimum allowed value
        });

        // Send the input amount to the contract address
        await bitcoind.sendToAddress(swap.contractAddress, swap.inputAmount);
        await waitFor(async () => (await backend.getSwapIn(swap.swapId)).status === 'CONTRACT_FUNDED_UNCONFIRMED');

        // Simulate passing the timeout block height
        await bitcoind.mine(145);

        // Verify Contract_EXPIRED status
        await waitFor(async () => {
            const swapIn = await backend.getSwapIn(swap.swapId);
            return swapIn.status === 'CONTRACT_EXPIRED';
        });

        // Now request a refund
        const refundPSBT = await backend.getRefundPsbt(swap.swapId, 'bcrt1qls85t60c5ggt3wwh7d5jfafajnxlhyelcsm3sf');

        // Sign the refund transaction
        signContractSpend({
            psbt: refundPSBT,
            network: network,
            key: ECPair.fromPrivateKey(refundKey.privateKey!),
            preImage: Buffer.alloc(0),
        });

        expect(refundPSBT.getFeeRate()).toBeLessThan(1000);
        const tx = refundPSBT.extractTransaction();

        await backend.publishRefundTx(swap.swapId, tx);
        // Wait for the refund to be confirmed
        await bitcoind.mine(6);
        await waitFor(async () => (await backend.getSwapIn(swap.swapId)).status === 'DONE');
        const swapIn = await backend.getSwapIn(swap.swapId);
        expect(swapIn.outcome).toEqual<SwapOutcome>('REFUNDED');
    });

    async function setUpComposeEnvironment(): Promise<void> {
        const configFilePath = `${os.tmpdir()}/40swap-test-${crypto.randomBytes(4).readUInt32LE(0)}.yml`;
        const composeDef = new DockerComposeEnvironment('test/resources', 'docker-compose.yml')
            .withBuild()
            .withWaitStrategy('40swap_backend', Wait.forHealthCheck())
            .withWaitStrategy('40swap_lnd_lsp', Wait.forLogMessage(/.*Waiting for chain backend to finish sync.*/))
            .withWaitStrategy('40swap_lnd_alice', Wait.forLogMessage(/.*Waiting for chain backend to finish sync.*/))
            .withWaitStrategy('40swap_lnd_user', Wait.forLogMessage(/.*Waiting for chain backend to finish sync.*/))
            .withWaitStrategy('40swap_elements', Wait.forLogMessage(/.*init message: Done loading.*/))
            .withEnvironment({ BACKEND_CONFIG_FILE: configFilePath });
        compose = await composeDef.up(['lnd-lsp', 'elements']);

        lndLsp = await Lnd.fromContainer(compose.getContainer('40swap_lnd_lsp'));
        elements = new Elements(compose.getContainer('40swap_elements'));
        // Initialize Elements wallet and get xpub
        await elements.startDescriptorWallet();
        await elements.mine(101);
        const xpub = await elements.getXpub();

        const config = {
            server: {
                port: 8081,
            },
            db: {
                host: 'postgres',
                port: 5432,
                username: '40swap',
                password: '40swap',
                database: '40swap',
            },
            bitcoin: {
                network: 'regtest',
                requiredConfirmations: 3,
            },
            nbxplorer: {
                baseUrl: 'http://nbxplorer:32838/v1/cryptos',
                fallbackFeeRate: 10,
            },
            mempoolBlockExplorer: {
                url: 'http://localhost:7084',
            },
            swap: {
                feePercentage: 0.5,
                minimumAmount: 0.00200000,
                maximumAmount: 0.01300000,
                expiryDuration: 'PT30M',
                lockBlockDelta: {
                    minIn: 144,
                    in: 432,
                    out: 20,
                },
            },
            lnd: {
                socket: 'lnd-lsp:10009',
                cert: lndLsp.cert,
                macaroon: lndLsp.macaroon,
            },
            elements: {
                network: 'regtest',
                rpcUrl: 'http://elements:18884',
                rpcUsername: '40swap',
                rpcPassword: 'pass',
                xpub,
            },
        };
        fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));

        compose = await composeDef.up();
        lndUser = await Lnd.fromContainer(compose.getContainer('40swap_lnd_user'));
        lndAlice = await Lnd.fromContainer(compose.getContainer('40swap_lnd_alice'));
        bitcoind = new Bitcoind(compose.getContainer('40swap_bitcoind'));
        backend = new BackendRestClient(compose.getContainer('40swap_backend'));
    }

    async function setUpBlockchains(): Promise<void> {
        const allLnds = [lndLsp, lndUser, lndAlice];

        await bitcoind.mine(10);
        await waitForChainSync(allLnds);
        for (const lnd of allLnds) {
            for (let i = 0; i < 10; i++) {
                await bitcoind.sendToAddress(lnd.address, 5);
            }
        }
        await bitcoind.mine();
        await lndLsp.connect(lndAlice.uri);
        await lndLsp.connect(lndUser.uri);
        await lndAlice.connect(lndUser.uri);
        await waitForChainSync(allLnds);
        await lndLsp.openChannel(lndAlice.pubkey, 0.16);
        await lndAlice.openChannel(lndUser.pubkey, 0.16);
        await lndUser.openChannel(lndAlice.pubkey, 0.16);
        await lndAlice.openChannel(lndLsp.pubkey, 0.16);
        await bitcoind.mine();
        await waitForChainSync(allLnds);

        // just to bootstrap the graph
        const ch = await lndLsp.openChannel(lndUser.pubkey, 0.16);
        await bitcoind.mine();
        await waitForChainSync(allLnds);
        // Force close the channel to avoid flaky issue 'unable to gracefully close  channel while peer is offline (try force closing it instead):  channel link not found'
        await lndLsp.closeChannel(ch, true);
        await bitcoind.mine();
        await waitForChainSync(allLnds);
        await waitFor(async () => (await lndLsp.describeGraph()).nodes?.length === 3);
    }
});
