import { DockerComposeEnvironment, StartedDockerComposeEnvironment, Wait } from 'testcontainers';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import { FortySwapClient, InMemoryPersistence, SwapService, SwapOutcome } from '@40swap/shared';
import { Lnd } from './Lnd';
import { Bitcoind } from './Bitcoind';
import { Elements } from './Elements';
import { ECPair, waitFor, waitForChainSync, waitForSwapStatus } from './utils';
import { networks } from 'bitcoinjs-lib';
import { jest } from '@jest/globals';
import assert from 'node:assert';

jest.setTimeout(2 * 60 * 1000);

const network = networks.regtest;

describe('40Swap backend', () => {
    let compose: StartedDockerComposeEnvironment;
    let lndLsp: Lnd;
    let lndUser: Lnd;
    let lndAlice: Lnd;
    let bitcoind: Bitcoind;
    let elements: Elements;
    let backend: FortySwapClient;
    let swapService: SwapService;

    beforeAll(async () => {
        await setUpComposeEnvironment();
        await setUpBlockchains();
    });

    afterAll(async () => {
        await compose.down();
    });

    it('should complete a swap in', async () => {
        const { paymentRequest, rHash } = await lndUser.createInvoice(0.0025);
        const swap = await swapService.createSwapIn({
            chain: 'BITCOIN',
            invoice: paymentRequest!,
            refundAddress: () => {
                throw new Error('should not be called');
            },
        });
        swap.start();
        await waitForSwapStatus(swap, 'CREATED');
        assert(swap.value != null);

        await bitcoind.sendToAddress(swap.value.contractAddress, swap.value.inputAmount);
        await waitForSwapStatus(swap, 'CONTRACT_FUNDED_UNCONFIRMED');
        await bitcoind.mine();
        await waitForSwapStatus(swap, 'CONTRACT_CLAIMED_UNCONFIRMED');
        await bitcoind.mine();
        await waitForSwapStatus(swap, 'DONE');

        expect(swap.value.outcome).toEqual<SwapOutcome>('SUCCESS');
        const invoice = await lndUser.lookupInvoice(rHash as Buffer);
        expect(invoice.state).toEqual('SETTLED');
    });
    it('should complete a swap out', async () => {
        // Create the swap out
        const swap = await swapService.createSwapOut({
            chain: 'BITCOIN',
            inputAmount: 0.002,
            sweepAddress: await lndUser.newAddress(),
        });
        swap.start();
        await waitForSwapStatus(swap, 'CREATED');
        assert(swap.value != null);

        // Pay the Lightning invoice
        lndUser.sendPayment(swap.value.invoice);
        await waitForSwapStatus(swap, 'CONTRACT_FUNDED_UNCONFIRMED');

        await bitcoind.mine();
        await waitForSwapStatus(swap, 'CONTRACT_FUNDED');
        await swap.claim();
        await waitForSwapStatus(swap, 'CONTRACT_CLAIMED_UNCONFIRMED');
        await bitcoind.mine();
        await waitForSwapStatus(swap, 'DONE');

        // Verify the swap outcome
        expect(swap.value.outcome).toEqual<SwapOutcome>('SUCCESS');
    });

    it('should complete a liquid swap out', async () => {
        const claimAddress = await elements.getNewAddress();
        const swap = await swapService.createSwapOut({
            chain: 'LIQUID',
            inputAmount: 0.002,
            sweepAddress: claimAddress,
        });
        swap.start();

        await waitForSwapStatus(swap, 'CREATED');

        assert(swap.value != null);
        lndUser.sendPayment(swap.value.invoice);
        await waitForSwapStatus(swap, 'CONTRACT_FUNDED_UNCONFIRMED');

        await elements.mine(5);
        await waitForSwapStatus(swap, 'CONTRACT_FUNDED');

        await elements.mine();
        await swap.claim();
        await elements.mine(5);
        await waitForSwapStatus(swap, 'DONE');
        expect(swap.value.outcome).toEqual<SwapOutcome>('SUCCESS');

        // TODO verify that the funds are in claimAddress
    });

    it('should properly handle a liquid swap out expiration', async () => {
        const claimAddress = await elements.getNewAddress();
        const swap = await swapService.createSwapOut({
            chain: 'LIQUID',
            inputAmount: 0.002,
            sweepAddress: claimAddress,
        });
        swap.start();

        await waitForSwapStatus(swap, 'CREATED');

        assert(swap.value != null);
        lndUser.sendPayment(swap.value.invoice);
        await waitForSwapStatus(swap, 'CONTRACT_FUNDED_UNCONFIRMED');

        swap.stop(); // so that it doesn't get claimed
        await elements.mine(5); // should move it to CONTRACT_FUNDED, but we can't assert it because the tracker is stopped
        const timeoutBlockHeight = swap.value.timeoutBlockHeight;
        const currentHeight = await elements.getBlockHeight();
        const blocksToMine = timeoutBlockHeight - currentHeight + 1;
        await elements.mine(blocksToMine);
        await waitFor(async () => (await backend.out.find(swap.id)).status === 'CONTRACT_REFUNDED_UNCONFIRMED');
        await elements.mine(10);
        await waitFor(async () => (await backend.out.find(swap.id)).status === 'DONE');
        expect((await backend.out.find(swap.id)).outcome).toEqual<SwapOutcome>('REFUNDED');
    });

    it('should complete a swap in with custom lockBlockDeltaIn', async () => {
        const { paymentRequest, rHash } = await lndUser.createInvoice(0.0025);
        const swap = await swapService.createSwapIn({
            chain: 'BITCOIN',
            invoice: paymentRequest!,
            lockBlockDeltaIn: 500, // Custom CLTV expiry for testing
            refundAddress: () => {
                throw new Error('should not be called');
            },
        });
        swap.start();
        await waitForSwapStatus(swap, 'CREATED');
        assert(swap.value != null);

        await bitcoind.sendToAddress(swap.value.contractAddress, swap.value.inputAmount);
        await waitForSwapStatus(swap, 'CONTRACT_FUNDED_UNCONFIRMED');
        await bitcoind.mine();
        await waitForSwapStatus(swap, 'CONTRACT_CLAIMED_UNCONFIRMED');
        await bitcoind.mine();
        await waitForSwapStatus(swap, 'DONE');

        expect(swap.value.outcome).toEqual<SwapOutcome>('SUCCESS');
        const invoice = await lndUser.lookupInvoice(rHash as Buffer);
        expect(invoice.state).toEqual('SETTLED');
    });

    it('should fail if lockBlockDeltaIn is less than 144', async () => {
        const refundKey = ECPair.makeRandom();
        const { paymentRequest } = await lndUser.createInvoice(0.0025);
        await expect(
            backend.in.create({
                chain: 'BITCOIN',
                invoice: paymentRequest!,
                refundPublicKey: refundKey.publicKey.toString('hex'),
                lockBlockDeltaIn: 100, // Less than the minimum allowed
            }),
        ).rejects.toThrow('lockBlockDeltaIn must be at least 144 blocks');
    });

    it('should refund after timeout block height', async () => {
        const { paymentRequest } = await lndUser.createInvoice(0.0025);
        const swap = await swapService.createSwapIn({
            chain: 'BITCOIN',
            invoice: paymentRequest!,
            refundAddress: async () => 'bcrt1qls85t60c5ggt3wwh7d5jfafajnxlhyelcsm3sf',
            lockBlockDeltaIn: 144, // Minimum allowed value
        });
        swap.start();
        await waitFor(async () => swap.value?.status === 'CREATED');
        assert(swap.value != null);

        // Send the input amount to the contract address
        await bitcoind.sendToAddress(swap.value.contractAddress, swap.value.inputAmount);
        await waitFor(async () => swap.value?.status === 'CONTRACT_FUNDED_UNCONFIRMED');

        // Simulate passing the timeout block height
        await bitcoind.mine(145);

        await waitFor(async () => swap.value?.status === 'CONTRACT_REFUNDED_UNCONFIRMED');
        await bitcoind.mine(6);
        await waitFor(async () => swap.value?.status === 'DONE');
        expect(swap.value.outcome).toEqual<SwapOutcome>('REFUNDED');
    });

    it('should complete a swap in with liquid', async () => {
        const { paymentRequest, rHash } = await lndUser.createInvoice(0.0025);
        const swap = await swapService.createSwapIn({
            chain: 'LIQUID',
            invoice: paymentRequest!,
            refundAddress: () => {
                throw new Error('should not be called');
            },
        });
        swap.start();
        await waitForSwapStatus(swap, 'CREATED');
        assert(swap.value != null);

        await elements.sendToAddress(swap.value.contractAddress, swap.value.inputAmount);
        await waitForSwapStatus(swap, 'CONTRACT_FUNDED_UNCONFIRMED');
        await elements.mine();
        await waitForSwapStatus(swap, 'CONTRACT_CLAIMED_UNCONFIRMED');
        await elements.mine();
        await waitForSwapStatus(swap, 'DONE');

        expect(swap.value.outcome).toEqual<SwapOutcome>('SUCCESS');
        const invoice = await lndUser.lookupInvoice(rHash as Buffer);
        expect(invoice.state).toEqual('SETTLED');
    });

    it('should refund swap-in after payment with wrong amount', async () => {
        const { paymentRequest } = await lndUser.createInvoice(0.0025);
        const swap = await swapService.createSwapIn({
            chain: 'BITCOIN',
            invoice: paymentRequest!,
            lockBlockDeltaIn: 144, // Minimum allowed value
            refundAddress: async () => 'bcrt1qls85t60c5ggt3wwh7d5jfafajnxlhyelcsm3sf',
        });
        swap.start();
        await waitForSwapStatus(swap, 'CREATED');
        assert(swap.value != null);

        // Send the input amount to the contract address a with a small extra amount to overpay (mismatched payment)
        await bitcoind.sendToAddress(swap.value.contractAddress, swap.value.inputAmount + 0.0001);
        await waitForSwapStatus(swap, 'CONTRACT_AMOUNT_MISMATCH_UNCONFIRMED');
        await bitcoind.mine();
        await waitForSwapStatus(swap, 'CONTRACT_AMOUNT_MISMATCH');

        // Simulate passing the timeout block height
        await bitcoind.mine(145);
        await waitFor(async () => swap.value?.status === 'CONTRACT_REFUNDED_UNCONFIRMED');

        // Wait for the refund to be confirmed
        await bitcoind.mine(6);
        await waitFor(async () => swap.value?.status === 'DONE');
        expect(swap.value.outcome).toEqual<SwapOutcome>('REFUNDED');
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
        const elementsWalletName = 'main';
        elements = new Elements(compose.getContainer('40swap_elements'), elementsWalletName);
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
                minimumAmount: 0.002,
                maximumAmount: 0.013,
                expiryDuration: 'PT30M',
                lockBlockDelta: {
                    minIn: 144,
                    in: 432,
                    out: 144,
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
                rpcWallet: elementsWalletName,
                esploraUrl: 'http://localhost:3000',
                xpub,
            },
        };
        fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));

        compose = await composeDef.up();
        lndUser = await Lnd.fromContainer(compose.getContainer('40swap_lnd_user'));
        lndAlice = await Lnd.fromContainer(compose.getContainer('40swap_lnd_alice'));
        bitcoind = new Bitcoind(compose.getContainer('40swap_bitcoind'));
        const backendContainer = compose.getContainer('40swap_backend');
        const backendBaseUrl = `http://${backendContainer.getHost()}:${backendContainer.getMappedPort(8081)}`;
        backend = new FortySwapClient(backendBaseUrl);
        swapService = new SwapService({
            network,
            baseUrl: backendBaseUrl,
            persistence: new InMemoryPersistence(),
        });
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
        // Force close the channel to avoid flaky issue 'unable to gracefully close channel while peer is offline
        // (try force closing it instead):  channel link not found'
        await lndLsp.closeChannel(ch, true);
        await bitcoind.mine();
        await waitForChainSync(allLnds);
        await waitFor(async () => (await lndLsp.describeGraph()).nodes?.length === 3);
    }
});
