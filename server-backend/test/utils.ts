import { Lnd } from './Lnd.js';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';

export const ECPair = ECPairFactory(ecc);

export async function waitForChainSync(lnds: Lnd[]): Promise<void> {
    for (const lnd of lnds) {
        await waitFor(async () => (await lnd.getInfo()).syncedToChain ?? false);
    }
}

export function sleep(ms = 1000): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function waitFor(fn: () => Promise<boolean>, maxIterations = 10, delay = 5000): Promise<void> {
    for (let i = 0; i < maxIterations; i++) {
        try {
            const res = await fn();
            if (res) {
                return;
            }
        } catch (e) {
            console.error(e);
        }
        await sleep(delay);
    }
    throw new Error(`timeout while waiting for condition: ${fn.toString()}`);
}
