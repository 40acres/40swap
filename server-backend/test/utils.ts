import { Lnd } from './Lnd.js';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import { SwapInStatus, SwapInTracker, SwapOutStatus, SwapOutTracker } from '@40swap/shared';

export const ECPair = ECPairFactory(ecc);

export async function waitForChainSync(lnds: Lnd[]): Promise<void> {
    for (const lnd of lnds) {
        await waitFor(async () => (await lnd.getInfo()).syncedToChain ?? false);
    }
}

export async function waitForSwapStatus<T extends SwapInTracker | SwapOutTracker>(
    swap: T,
    status: T extends SwapInTracker ? SwapInStatus : SwapOutStatus,
    maxIterations = 150,
    delay = 100,
): Promise<void> {
    try {
        return await waitFor(() => swap.value?.status === status, maxIterations, delay);
    } catch (error) {
        throw new Error(`timeout waiting for swap status to become ${status} (current status is ${swap.value?.status})`);
    }
}

export function sleep(ms = 1000): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitFor(fn: () => boolean | Promise<boolean>, maxIterations = 20, delay = 1000): Promise<void> {
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
