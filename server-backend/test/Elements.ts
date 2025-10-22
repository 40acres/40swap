import { StartedGenericContainer } from 'testcontainers/build/generic-container/started-generic-container.js';

export class Elements {
    constructor(
        private container: StartedGenericContainer,
        private walletName: string = 'main',
    ) {}

    async mine(blocks = 3): Promise<void> {
        const res = await this.container.exec(`elements-cli -chain=liquidregtest -rpcwallet=${this.walletName} -generate ${blocks}`);
        if (res.exitCode !== 0) {
            throw new Error(`command failed: ${res.stdout} ${res.stderr}`);
        }
    }

    async sendToAddress(address: string, amount: number): Promise<void> {
        const res = await this.container.exec(
            `elements-cli -chain=liquidregtest -rpcwallet=${this.walletName} -named sendtoaddress address=${address} amount=${amount} fee_rate=25`,
        );
        if (res.exitCode !== 0) {
            throw new Error(`command failed: ${res.stdout} ${res.stderr}`);
        }
    }

    async getNewAddress(): Promise<string> {
        const res = await this.container.exec(`elements-cli -chain=liquidregtest -rpcwallet=${this.walletName} getnewaddress`);
        if (res.exitCode !== 0) {
            throw new Error(`command failed: ${res.stdout} ${res.stderr}`);
        }
        return res.stdout.trim();
    }

    async getXpub(): Promise<string> {
        const res = await this.container.exec(`elements-cli -chain=liquidregtest -rpcwallet=${this.walletName} listdescriptors`);
        if (res.exitCode !== 0) {
            throw new Error(`command failed: ${res.stdout} ${res.stderr}`);
        }
        const descriptors = JSON.parse(res.stdout);
        const xpub = descriptors.descriptors
            .find((d: { desc: string; internal: boolean }) => d.desc.startsWith('wpkh(') && !d.internal)
            ?.desc.match(/.*\]([^/]+)\/.*/)?.[1];

        if (!xpub) {
            throw new Error('Could not find xpub in descriptors');
        }
        return xpub;
    }

    async startDescriptorWallet(): Promise<void> {
        // Create a new wallet
        // eslint-disable-next-line quotes
        const res = await this.container.exec(`elements-cli -chain=liquidregtest createwallet ${this.walletName} false false  false true true false`);
        if (res.exitCode !== 0) {
            throw new Error(`command failed: ${res.stdout} ${res.stderr}`);
        }
    }

    async getBlockHeight(): Promise<number> {
        const res = await this.container.exec(`elements-cli -chain=liquidregtest -rpcwallet=${this.walletName} getblockcount`);
        if (res.exitCode !== 0) {
            throw new Error(`command failed: ${res.stdout} ${res.stderr}`);
        }
        return parseInt(res.stdout.trim(), 10);
    }

    async issueAsset(amount: number): Promise<{ asset: string; token: string }> {
        const res = await this.container.exec(`elements-cli -chain=liquidregtest -rpcwallet=${this.walletName} issueasset ${amount} 0 false`);
        if (res.exitCode !== 0) {
            throw new Error(`command failed: ${res.stdout} ${res.stderr}`);
        }
        const result = JSON.parse(res.stdout);
        return {
            asset: result.asset,
            token: result.token,
        };
    }

    async sendAssetToAddress(address: string, amount: number, asset: string): Promise<string> {
        const res = await this.container.exec(
            `elements-cli -chain=liquidregtest -rpcwallet=${this.walletName} -named sendtoaddress address=${address} amount=${amount} assetlabel=${asset} fee_rate=25`,
        );
        if (res.exitCode !== 0) {
            throw new Error(`command failed: ${res.stdout} ${res.stderr}`);
        }
        // sendtoaddress returns just the transaction hash, not JSON
        return res.stdout.trim();
    }
}
