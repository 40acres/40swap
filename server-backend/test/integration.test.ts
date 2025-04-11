import { DockerComposeEnvironment, StartedDockerComposeEnvironment, Wait } from 'testcontainers';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import { SwapInStatus, SwapOutcome } from '../../shared/src/api.types';
import { Lnd } from './Lnd';
import { Bitcoind } from './Bitcoind';
import { Elements } from './Elements';
import { BackendRestClient } from './BackendRestClient';
import { ECPair, waitFor, waitForChainSync, signLiquidPset } from './utils';

jest.setTimeout(2 * 60 * 1000);

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
        const signedTx = signLiquidPset(claimPsbt.psbt, preImage.toString('hex'), claimKey);
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

    async function setUpComposeEnvironment(): Promise<void> {
        const configFilePath = `${os.tmpdir()}/40swap-test-${crypto.randomBytes(4).readUInt32LE(0)}.yml`;
        const composeDef = new DockerComposeEnvironment('test/resources', 'docker-compose.yml')
            .withBuild()
            .withWaitStrategy('40swap-backend-1', Wait.forHealthCheck())
            .withWaitStrategy('lnd-lsp-1', Wait.forLogMessage(/.*Waiting for chain backend to finish sync.*/))
            .withWaitStrategy('lnd-alice-1', Wait.forLogMessage(/.*Waiting for chain backend to finish sync.*/))
            .withWaitStrategy('lnd-user-1', Wait.forLogMessage(/.*Waiting for chain backend to finish sync.*/))
            .withWaitStrategy('elements-1', Wait.forLogMessage(/.*init message: Done loading.*/))
            .withEnvironment({ BACKEND_CONFIG_FILE: configFilePath });
        compose = await composeDef.up(['lnd-lsp', 'elements']);

        lndLsp = await Lnd.fromContainer(compose.getContainer('lnd-lsp-1'));
        elements = new Elements(compose.getContainer('elements-1'));
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
        lndUser = await Lnd.fromContainer(compose.getContainer('lnd-user-1'));
        lndAlice = await Lnd.fromContainer(compose.getContainer('lnd-alice-1'));
        bitcoind = new Bitcoind(compose.getContainer('bitcoind-1'));
        backend = new BackendRestClient(compose.getContainer('40swap-backend-1'));
    }

    async function setUpBlockchains(): Promise<void> {
        const allLnds = [lndLsp, lndUser, lndAlice];

        await bitcoind.mine(10);
        await waitForChainSync(allLnds);
        for (const lnd of allLnds) {
            for(let i = 0; i < 10; i++) {
                await bitcoind.sendToAddress(lnd.address, 5);
            }
        }
        await bitcoind.mine();
        await lndLsp.connect(lndAlice.uri);
        await lndLsp.connect(lndUser.uri);
        await lndAlice.connect(lndUser.uri);
        await waitForChainSync(allLnds);
        await lndLsp.openChannel(lndAlice.pubkey, 0.05);
        await lndAlice.openChannel(lndUser.pubkey, 0.05);
        await lndUser.openChannel(lndAlice.pubkey, 0.05);
        await lndAlice.openChannel(lndLsp.pubkey, 0.05);
        await bitcoind.mine();
        await waitForChainSync(allLnds);

        // just to bootstrap the graph
        const ch = await lndLsp.openChannel(lndUser.pubkey, 0.05);
        await bitcoind.mine();
        await waitForChainSync(allLnds);
        await lndLsp.closeChannel(ch);
        await bitcoind.mine();
        await waitForChainSync(allLnds);
        await waitFor(async () => (await lndLsp.describeGraph()).nodes?.length === 3);
    }
});
