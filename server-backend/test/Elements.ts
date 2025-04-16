import { StartedGenericContainer } from 'testcontainers/build/generic-container/started-generic-container.js';

export class Elements {
    constructor(
        private container: StartedGenericContainer,
    ) {}

    async mine(blocks = 3): Promise<void> {
        const res = await this.container.exec(`elements-cli -chain=liquidregtest -generate ${blocks}`);
        if (res.exitCode !== 0) {
            throw new Error(`command failed: ${res.stdout} ${res.stderr}`);
        }
        console.log(res.stdout);
    }

    async sendToAddress(address: string, amount: number): Promise<void> {
        const res = await this.container.exec(`elements-cli -chain=liquidregtest -named sendtoaddress address=${address} amount=${amount} fee_rate=25`);
        if (res.exitCode !== 0) {
            throw new Error(`command failed: ${res.stdout} ${res.stderr}`);
        }
        console.log(res.stdout);
    }

    async getNewAddress(): Promise<string> {
        const res = await this.container.exec('elements-cli -chain=liquidregtest getnewaddress');
        if (res.exitCode !== 0) {
            throw new Error(`command failed: ${res.stdout} ${res.stderr}`);
        }
        return res.stdout.trim();
    }

    async getXpub(): Promise<string> {
        const res = await this.container.exec('elements-cli -chain=liquidregtest listdescriptors');
        if (res.exitCode !== 0) {
            throw new Error(`command failed: ${res.stdout} ${res.stderr}`);
        }
        const descriptors = JSON.parse(res.stdout);
        const xpub = descriptors.descriptors
            .find((d: { desc: string; internal: boolean }) => d.desc.startsWith('wpkh(') && !d.internal)
            ?.desc
            .match(/.*\]([^/]+)\/.*/)?.[1];
        
        if (!xpub) {
            throw new Error('Could not find xpub in descriptors');
        }
        return xpub;
    }

    async startDescriptorWallet(): Promise<void> {
        // First unload the wallet
        await this.container.exec('elements-cli -chain=liquidregtest unloadwallet ""');
        
        // Remove original wallet files
        await this.container.exec('rm -r -f /home/elements/.elements/liquidregtest/wallets/*');
        
        // Create a new wallet
        // eslint-disable-next-line quotes
        const res = await this.container.exec(`elements-cli -chain=liquidregtest createwallet  false false  false true true false`);
        if (res.exitCode !== 0) {
            throw new Error(`command failed: ${res.stdout} ${res.stderr}`);
        }
    }

    async getBlockHeight(): Promise<number> {
        const res = await this.container.exec('elements-cli -chain=liquidregtest getblockcount');
        if (res.exitCode !== 0) {
            throw new Error(`command failed: ${res.stdout} ${res.stderr}`);
        }
        return parseInt(res.stdout.trim(), 10);
    }
} 