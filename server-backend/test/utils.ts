import { Lnd } from './Lnd.js';
import { ECPairFactory, ECPairInterface } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import * as liquid from 'liquidjs-lib';

export const ECPair = ECPairFactory(ecc);

export async function waitForChainSync(lnds: Lnd[]): Promise<void> {
    for (const lnd of lnds) {
        await waitFor(async () => (await lnd.getInfo()).syncedToChain ?? false);
    }
}

export function sleep(ms = 1000): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function waitFor(fn: () => Promise<boolean>): Promise<void> {
    for (let i = 0; i < 5; i++) {
        try {
            const res = await fn();
            if (res) {
                return;
            }
        } catch (e) {
            console.error(e);
        }
        await sleep(1000);
    }
    throw new Error(`timeout while waiting for condition: ${fn.toString()}`);
}

export function signLiquidPset(psbt: string, preImage: string, key: ECPairInterface): string {
    const pset = liquid.Pset.fromBase64(psbt);
    const inputIndex = 0;
    const input = pset.inputs[inputIndex];
    const preimageBuffer = Buffer.from(preImage, 'hex');
    const sighashType = liquid.Transaction.SIGHASH_ALL;
    const signature = liquid.script.signature.encode(
        key.sign(pset.getInputPreimage(inputIndex, sighashType)),
        sighashType,
    );
    const signer = new liquid.Signer(pset);
    signer.addSignature(
        inputIndex,
        {
            partialSig: {
                pubkey: key.publicKey,
                signature,
            },
        },
        liquid.Pset.ECDSASigValidator(ecc),
    );
    const finalizer = new liquid.Finalizer(pset);
    const stack = [signature,preimageBuffer,input.witnessScript!];
    finalizer.finalizeInput(inputIndex, () => {
        return {finalScriptWitness: liquid.witnessStackToScriptWitness(stack)};
    });
    const transaction = liquid.Extractor.extract(pset);
    return transaction.toHex();
}
