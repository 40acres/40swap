import { bitcoin as bitcoinMainnet, Network as bitcoinNetwork, regtest as bitcoinRegtest, testnet as bitcoinTestnet } from 'bitcoinjs-lib/src/networks.js';
import { liquid as liquidMainnet, Network as liquidNetwork, regtest as liquidRegtest, testnet as liquidTestnet } from 'liquidjs-lib/src/networks.js';
import { ECPairInterface } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import * as liquid from 'liquidjs-lib';
import secp256k1Module from '@vulpemventures/secp256k1-zkp';

export function getLiquidNetworkFromBitcoinNetwork(network: bitcoinNetwork): liquidNetwork {
    switch (network) {
        case bitcoinMainnet:
            return liquidMainnet;
        case bitcoinRegtest:
            return liquidRegtest;
        case bitcoinTestnet:
            return liquidTestnet;
        default:
            throw new Error(`Unsupported network: ${network}`);
    }
}

export function signLiquidPset(pset: liquid.Pset, preImage: string, key: ECPairInterface): void {
    const inputIndex = 0;
    const input = pset.inputs[inputIndex];
    const preimageBuffer = Buffer.from(preImage, 'hex');
    const sighashType = liquid.Transaction.SIGHASH_ALL;
    const signature = liquid.script.signature.encode(key.sign(pset.getInputPreimage(inputIndex, sighashType)), sighashType);
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
    const stack = [signature, preimageBuffer, input.witnessScript!];
    finalizer.finalizeInput(inputIndex, () => {
        return { finalScriptWitness: liquid.witnessStackToScriptWitness(stack) };
    });
}

/**
 * Blinds the given PSET using the input UTXO data and output blinding pubkeys.
 * Only blinds outputs that are not fee outputs.
 */
export async function blindPset(
    pset: liquid.Pset,
    utxosKeys: {
        blindingPrivateKey: Buffer;
    }[],
    outputsToBlind: number[] | null = null,
): Promise<void> {
    const secp = await (secp256k1Module as unknown as { default: () => Promise<liquid.Secp256k1Interface> }).default();
    const zkpGenerator = new liquid.ZKPGenerator(secp, liquid.ZKPGenerator.WithBlindingKeysOfInputs(utxosKeys.map((utxoKey) => utxoKey.blindingPrivateKey!)));
    const zkpValidator = new liquid.ZKPValidator(secp as liquid.Secp256k1Interface);
    const outputs =
        outputsToBlind ??
        pset.outputs
            .map((_, i) => i)
            .filter((i) => {
                const script = pset.outputs[i]?.script;
                return script && Buffer.isBuffer(script) && script.length > 0;
            });
    const keysGenerator = liquid.Pset.ECCKeysGenerator(secp.ecc);
    const outputBlindingArgs = zkpGenerator.blindOutputs(pset, keysGenerator, outputs);
    const ownedInputs = zkpGenerator.unblindInputs(pset);
    const blinder = new liquid.Blinder(pset, ownedInputs, zkpValidator, zkpGenerator);
    blinder.blindLast({ outputBlindingArgs });
}

/**
 * Unblinds the given output using the given blinding key.
 * Returns the unblinded output value and the blinding factor.
 */
export async function unblindOutput(output: liquid.TxOutput, blindingKey: Buffer): Promise<liquid.confidential.UnblindOutputResult> {
    const secp = await (secp256k1Module as unknown as { default: () => Promise<liquid.Secp256k1Interface> }).default();
    const confidential = new liquid.confidential.Confidential(secp);
    try {
        return confidential.unblindOutputWithKey(output, blindingKey);
    } catch (e) {
        throw new Error(`Unblinding failed: ${e instanceof Error ? e.message : e}`);
    }
}

export async function findUnblindableOutputs(tx: liquid.Transaction, privKey: Buffer): Promise<liquid.confidential.UnblindOutputResult[]> {
    const secp = await (secp256k1Module as unknown as { default: () => Promise<liquid.Secp256k1Interface> }).default();
    const confidential = new liquid.confidential.Confidential(secp);

    const results = await Promise.allSettled(
        tx.outs.map((out) => {
            try {
                return Promise.resolve(confidential.unblindOutputWithKey(out, privKey));
            } catch (e) {
                return Promise.reject(e);
            }
        }),
    );

    return results.filter((r): r is PromiseFulfilledResult<liquid.confidential.UnblindOutputResult> => r.status === 'fulfilled').map((r) => r.value);
}
