import { DockerComposeEnvironment, StartedDockerComposeEnvironment, Wait } from 'testcontainers';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as yaml from 'js-yaml';
import { signContractSpend, SwapOutcome, SwapInStatus, FortySwapClient } from '@40swap/shared';
import { Lnd } from './Lnd';
import { Bitcoind } from './Bitcoind';
import { ECPair, waitFor, waitForChainSync } from './utils';
import { networks, Psbt } from 'bitcoinjs-lib';
import { jest } from '@jest/globals';

jest.setTimeout(2 * 60 * 1000);

const network = networks.regtest;

// Test suite for Bitcoin functionality without Elements config
describe.skip('Bitcoin functions without Elements config', () => {
    let compose: StartedDockerComposeEnvironment;
    let btcOnlyLndLsp: Lnd;
    let btcOnlyLndUser: Lnd;
    let btcOnlyLndAlice: Lnd;
    let btcOnlyBitcoind: Bitcoind;
    let btcOnlyBackend: FortySwapClient;

    beforeAll(async () => {
        // Set up a separate environment without elements config
        await setUpBitcoinOnlyEnvironment();
    });

    afterAll(async () => {
        await compose.down();
    });

    it('should complete a swap in without elements config', async () => {
        const refundKey = ECPair.makeRandom();
        const { paymentRequest, rHash } = await btcOnlyLndUser.createInvoice(0.0025);
        let swap = await btcOnlyBackend.in.create({
            chain: 'BITCOIN',
            invoice: paymentRequest!,
            refundPublicKey: refundKey.publicKey.toString('hex'),
        });
        expect(swap.status).toEqual<SwapInStatus>('CREATED');

        await btcOnlyBitcoind.sendToAddress(swap.contractAddress, swap.inputAmount);
        await waitFor(async () => (await btcOnlyBackend.in.find(swap.swapId)).status === 'CONTRACT_FUNDED_UNCONFIRMED');
        await btcOnlyBitcoind.mine();
        await waitFor(async () => (await btcOnlyBackend.in.find(swap.swapId)).status === 'CONTRACT_CLAIMED_UNCONFIRMED');
        await btcOnlyBitcoind.mine();
        await waitFor(async () => (await btcOnlyBackend.in.find(swap.swapId)).status === 'DONE');

        swap = await btcOnlyBackend.in.find(swap.swapId);
        expect(swap.outcome).toEqual<SwapOutcome>('SUCCESS');
        const invoice = await btcOnlyLndUser.lookupInvoice(rHash as Buffer);
        expect(invoice.state).toEqual('SETTLED');
    });

    it('should handle refund after timeout block height without elements config', async () => {
        const refundKey = ECPair.makeRandom();
        const { paymentRequest } = await btcOnlyLndUser.createInvoice(0.0025);
        const swap = await btcOnlyBackend.in.create({
            chain: 'BITCOIN',
            invoice: paymentRequest!,
            refundPublicKey: refundKey.publicKey.toString('hex'),
            lockBlockDeltaIn: 144, // Use minimum value to speed up test
        });

        // Fund the contract
        await btcOnlyBitcoind.sendToAddress(swap.contractAddress, swap.inputAmount);
        await waitFor(async () => (await btcOnlyBackend.in.find(swap.swapId)).status === 'CONTRACT_FUNDED_UNCONFIRMED');
        await btcOnlyBitcoind.mine();
        await waitFor(async () => (await btcOnlyBackend.in.find(swap.swapId)).status === 'CONTRACT_FUNDED');

        // Mine blocks to trigger expiration
        await btcOnlyBitcoind.mine(144);
        await waitFor(async () => (await btcOnlyBackend.in.find(swap.swapId)).status === 'CONTRACT_EXPIRED');

        // Get and sign the refund PSBT
        const refundPSBTBase64 = await btcOnlyBackend.in.getRefundPsbt(swap.swapId, 'bcrt1qls85t60c5ggt3wwh7d5jfafajnxlhyelcsm3sf');
        const refundPSBT = Psbt.fromBase64(refundPSBTBase64, { network });
        signContractSpend({
            psbt: refundPSBT,
            key: ECPair.fromPrivateKey(refundKey.privateKey!),
            network: networks.regtest,
            preImage: Buffer.alloc(0),
        });

        expect(refundPSBT.getFeeRate()).toBeLessThan(1000);
        const tx = refundPSBT.extractTransaction();

        await btcOnlyBackend.in.publishRefundTx(swap.swapId, tx.toHex());
        // Wait for the refund to be confirmed
        await btcOnlyBitcoind.mine(6);
        await waitFor(async () => (await btcOnlyBackend.in.find(swap.swapId)).status === 'DONE');
        const swapIn = await btcOnlyBackend.in.find(swap.swapId);
        expect(swapIn.outcome).toEqual<SwapOutcome>('REFUNDED');
    });

    it('should fail to create a swap in with LIQUID chain when elements config is missing', async () => {
        const refundKey = ECPair.makeRandom();
        const { paymentRequest } = await btcOnlyLndUser.createInvoice(0.0025);
        await expect(
            btcOnlyBackend.in.create({
                chain: 'LIQUID',
                invoice: paymentRequest!,
                refundPublicKey: refundKey.publicKey.toString('hex'),
            }),
        ).rejects.toThrow();
    });

    it('should fail to create a swap out with LIQUID chain when elements config is missing', async () => {
        const preImageHash = crypto.createHash('sha256').update(crypto.randomBytes(32)).digest();
        const claimKey = ECPair.makeRandom();
        await expect(
            btcOnlyBackend.out.create({
                chain: 'LIQUID',
                inputAmount: 0.002,
                claimPubKey: claimKey.publicKey.toString('hex'),
                preImageHash: preImageHash.toString('hex'),
            }),
        ).rejects.toThrow();
    });

    async function setUpBitcoinOnlyEnvironment(): Promise<void> {
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

        btcOnlyLndLsp = await Lnd.fromContainer(compose.getContainer('40swap_lnd_lsp'));

        // Create configuration without elements section
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
                longPollingTimeoutSeconds: 5, // Shorter timeout for tests
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
                    out: 20,
                },
            },
            lnd: {
                socket: 'lnd-lsp:10009',
                cert: btcOnlyLndLsp.cert,
                macaroon: btcOnlyLndLsp.macaroon,
            },
            // No elements config here
        };
        // Convert the config object to YAML format
        fs.writeFileSync(configFilePath, yaml.dump(config));

        compose = await composeDef.up();
        btcOnlyLndUser = await Lnd.fromContainer(compose.getContainer('40swap_lnd_user'));
        btcOnlyLndAlice = await Lnd.fromContainer(compose.getContainer('40swap_lnd_alice'));
        btcOnlyBitcoind = new Bitcoind(compose.getContainer('40swap_bitcoind'));
        const backendContainer = compose.getContainer('40swap_backend');
        const backendBaseUrl = `http://${backendContainer.getHost()}:${backendContainer.getMappedPort(8081)}`;
        btcOnlyBackend = new FortySwapClient(backendBaseUrl);

        // Set up blockchains
        const allLnds = [btcOnlyLndLsp, btcOnlyLndUser, btcOnlyLndAlice];

        await btcOnlyBitcoind.mine(10);
        await waitForChainSync(allLnds);
        for (const lnd of allLnds) {
            for (let i = 0; i < 10; i++) {
                await btcOnlyBitcoind.sendToAddress(lnd.address, 5);
            }
        }
        await btcOnlyBitcoind.mine();
        await btcOnlyLndLsp.connect(btcOnlyLndAlice.uri);
        await btcOnlyLndLsp.connect(btcOnlyLndUser.uri);
        await btcOnlyLndAlice.connect(btcOnlyLndUser.uri);
        await waitForChainSync(allLnds);
        await btcOnlyLndLsp.openChannel(btcOnlyLndAlice.pubkey, 0.16);
        await btcOnlyLndAlice.openChannel(btcOnlyLndUser.pubkey, 0.16);
        await btcOnlyLndUser.openChannel(btcOnlyLndAlice.pubkey, 0.16);
        await btcOnlyLndAlice.openChannel(btcOnlyLndLsp.pubkey, 0.16);
        await btcOnlyBitcoind.mine();
        await waitForChainSync(allLnds);

        // Bootstrap the graph
        const ch = await btcOnlyLndLsp.openChannel(btcOnlyLndUser.pubkey, 0.16);
        await btcOnlyBitcoind.mine();
        await waitForChainSync(allLnds);
        await btcOnlyLndLsp.closeChannel(ch, true);
        await btcOnlyBitcoind.mine();
        await waitForChainSync(allLnds);
        await waitFor(async () => (await btcOnlyLndLsp.describeGraph()).nodes?.length === 3);
    }
});
