import { bitcoin as bitcoinMainnet, regtest as bitcoinRegtest, testnet as bitcoinTestnet, Network as bitcoinNetwork } from 'bitcoinjs-lib/src/networks.js';
import { liquid as liquidMainnet, regtest as liquidRegtest, testnet as liquidTestnet, Network as liquidNetwork } from 'liquidjs-lib/src/networks.js';
import { ECPairFactory, ECPairInterface } from 'ecpair';
import secp256k1Module from '@vulpemventures/secp256k1-zkp';
import * as ecc from 'tiny-secp256k1';
import * as liquid from 'liquidjs-lib';

export const ECPair = ECPairFactory(ecc);

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
}

/**
 * Blinds the given PSET using the input UTXO data and output blinding pubkeys.
 * Only blinds outputs that are not fee outputs.
 */
export async function blindPset(pset: liquid.Pset, utxos: {
    blindingPrivateKey: Buffer;
}[]): Promise<void> {
    const secp = await (secp256k1Module as unknown as {default: () => Promise<liquid.Secp256k1Interface>}).default();
    const zkpGenerator = new liquid.ZKPGenerator(
        secp,
        liquid.ZKPGenerator.WithBlindingKeysOfInputs(utxos.map((utxo) => utxo.blindingPrivateKey!))
    );
    const zkpValidator = new liquid.ZKPValidator(secp as liquid.Secp256k1Interface);
    const outputBlindingArgs = zkpGenerator.blindOutputs(
        pset,
        liquid.Pset.ECCKeysGenerator(secp.ecc),
    );

    const blinder = new liquid.Blinder(
        pset,
        zkpGenerator.unblindInputs(pset),
        zkpValidator,
        zkpGenerator,
    );

    blinder.blindLast({ outputBlindingArgs });
}