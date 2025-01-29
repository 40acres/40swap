import { StartedGenericContainer } from 'testcontainers/build/generic-container/started-generic-container.js';

export class Bitcoind {
    constructor(
        private container: StartedGenericContainer,
    ) {}

    async mine(blocks = 3): Promise<void> {
        const res = await this.container.exec(`bitcoin-cli -regtest -generate ${blocks}`, {
            user: 'bitcoin',
        });
        if (res.exitCode !== 0) {
            throw new Error(`command failed: ${res.stdout} ${res.stderr}`);
        }
        console.log(res.stdout);
    }

    async sendToAddress(address: string, amount: number): Promise<void> {
        const res = await this.container.exec(`bitcoin-cli -regtest -named sendtoaddress address=${address} amount=${amount} fee_rate=25`, {
            user: 'bitcoin',
        });
        if (res.exitCode !== 0) {
            throw new Error(`command failed: ${res.stdout} ${res.stderr}`);
        }
        console.log(res.stdout);

    }
}