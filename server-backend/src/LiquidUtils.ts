import BIP32Factory from 'bip32';
import * as liquid from 'liquidjs-lib';
import { nbxplorerHotWallet, NbxplorerService } from './NbxplorerService';
import * as ecc from 'tiny-secp256k1';
import { Network } from 'bitcoinjs-lib';
import { liquid as liquidNetwork } from 'liquidjs-lib/src/networks.js';
import { varuint } from 'liquidjs-lib/src/bufferutils.js';
import { ECPairFactory } from 'ecpair';
import { Output } from 'liquidjs-lib/src/transaction';

const bip32 = BIP32Factory(ecc);
const ECPair = ECPairFactory(ecc);

export type ScriptElement = Buffer | number | string;

export const getHexString = (input: Buffer): string => {
    return input.toString('hex');
};

export const getHexBuffer = (input: string): Buffer => {
    return Buffer.from(input, 'hex');
};

export const scriptBuffersToScript = (elements: ScriptElement[]): Buffer => {
    const buffers: Buffer[] = [];
  
    elements.forEach((element) => {
        if (Buffer.isBuffer(element)) {
            buffers.push(
                Buffer.concat([
                    Buffer.from(varuint.encode(element.length).buffer),
                    element,
                ]),
            );
        } else {
            buffers.push(getHexBuffer(element.toString(16)));
        }
    });
  
    return Buffer.concat(buffers);
};
  

export function liquidReverseSwapScript(
    preimageHash: Buffer,
    claimPublicKey: Buffer,
    refundPublicKey: Buffer,
    timeoutBlockHeight: number,
): Buffer {
    /* eslint-disable indent */
    const htlcScript = liquid.script.compile([
        liquid.script.OPS.OP_SIZE,
        liquid.script.number.encode(32),
        liquid.script.OPS.OP_EQUAL,
        liquid.script.OPS.OP_IF,
            liquid.script.OPS.OP_HASH160,
            liquid.crypto.ripemd160(preimageHash),
            liquid.script.OPS.OP_EQUALVERIFY,
            claimPublicKey,
        liquid.script.OPS.OP_ELSE,
            liquid.script.OPS.OP_DROP,
            liquid.script.number.encode(timeoutBlockHeight),
            liquid.script.OPS.OP_CHECKLOCKTIMEVERIFY,
            liquid.script.OPS.OP_DROP,
            refundPublicKey,
        liquid.script.OPS.OP_ENDIF,
        liquid.script.OPS.OP_CHECKSIG,
    ]);
    return htlcScript;
}

export function getKeysFromHotWallet(wallet: nbxplorerHotWallet, network: Network): { 
    pubKey: Uint8Array,
    privKey: Uint8Array 
} {
    const account = bip32.fromBase58(wallet.accountHDKey, network);
    return {
        pubKey: account.publicKey,
        privKey: account.privateKey!,
    };
}

export async function buildLiquidPsbt(
    xpub: string,
    xpriv: string,
    requiredAmount: number,
    contractAddress: string,
    network: typeof liquidNetwork,
    nbxplorer: NbxplorerService,
    blindingKey?: Buffer | undefined,
  ): Promise<void> {
    // get utxos from nbxplorer
    const utxoResponse = await nbxplorer.getUTXOs(xpub, 'lbtc');
    if (!utxoResponse) {
        throw new Error('No UTXOs returned from NBXplorer');
    }

    // get confirmed utxos for input
    const utxos = utxoResponse.confirmed.utxOs;
    // console.log(utxos);
    let totalInputValue = 0;
    const selectedUtxos = [];
    for (const utxo of utxos) {
        selectedUtxos.push(utxo);
        totalInputValue += Number(utxo.value);
        if (totalInputValue >= requiredAmount) {
            break;
        }
    }
    if (totalInputValue < requiredAmount) {
        throw new Error(`Insufficient funds, required ${requiredAmount} but only ${totalInputValue} available`);
    }

    // Create a new pset
    console.log('--------------------------------');
    const pset = liquid.Creator.newPset();
    const updater = new liquid.Updater(pset);
    console.log('New PSET');
    console.log(pset);

    // Add inputs to psbt
    console.log('--------------------------------');
    await Promise.all(selectedUtxos.map(async (utxo, i) => {
        const {transaction: tx} = await nbxplorer.getWalletTransaction(xpub, utxo.transactionHash, 'lbtc');
        const liquidTx = liquid.Transaction.fromBuffer(Buffer.from(tx, 'hex'));
        const input = new liquid.CreatorInput(utxo.transactionHash, utxo.value);
        pset.addInput(input.toPartialInput());
        updater.addInSighashType(i, liquid.Transaction.SIGHASH_ALL);
        // updater.addInNonWitnessUtxo(i, liquidTx);
        
        // Make sure the previous output is correctly referenced
        if (!utxo.scriptPubKey) {
            throw new Error(`Missing scriptPubKey for input ${i}`);
        }
        
        updater.addInRedeemScript(
          i,
          scriptBuffersToScript([
            scriptBuffersToScript([
              getHexString(varuint.encode(liquid.script.OPS.OP_0)), 
              liquid.crypto.sha256(Buffer.from(utxo.scriptPubKey, 'hex')),
            ]),
          ]),
        );
        
        updater.addInWitnessUtxo(i, {
            ...utxo,
            script: Buffer.from(utxo.scriptPubKey, 'hex'),
            value: Buffer.from(liquid.ElementsValue.fromNumber(Number(utxo.value)).bytes),
            asset: Buffer.from(network.assetHash, 'hex'),
            nonce: Buffer.from([0x00]),
        });
        updater.addInWitnessScript(i, Buffer.from(utxo.scriptPubKey, 'hex'));
    }));

    console.log('Added inputs');
    console.log(pset);

    // Add outputs
    console.log('--------------------------------');
    const claimOutput = new liquid.CreatorOutput(
        network.assetHash,
        liquid.ElementsValue.fromNumber(Number(requiredAmount)).number,
        Buffer.from(contractAddress, 'hex'),
        blindingKey !== undefined ? Buffer.from(blindingKey) : undefined,
        blindingKey !== undefined ? 0 : undefined
    );
    updater.addOutputs([claimOutput]);

    console.log('Added outputs');
    console.log(pset);

    // Add change output
    console.log('--------------------------------');
    // TODO: check if change address is already in swap object
    const changeAddress = await nbxplorer.getUnusedAddress(xpub, 'lbtc', { change: true });
    console.log('Change address:', changeAddress);
    const changeOutputScript = liquid.address.toOutputScript(changeAddress.address, network);
    const changeOutput = new liquid.CreatorOutput(
        network.assetHash,
        liquid.ElementsValue.fromNumber(Number(totalInputValue - requiredAmount)).number,
        changeOutputScript,
        blindingKey !== undefined ? Buffer.from(blindingKey) : undefined,
        blindingKey !== undefined ? 0 : undefined
    );
    updater.addOutputs([changeOutput]);

    console.log('Added change output');
    console.log(pset);

    // Sign inputs
    // console.log('--------------------------------');
    // const signer = new liquid.Signer(pset);
    // const signatures: Buffer[] = [];

    // for (let i = 0; i < selectedUtxos.length; i++) {
    //     const utxo = selectedUtxos[i];
    //     const node = bip32.fromBase58(xpriv, network);
    //     const child = node.derivePath(utxo.keyPath);
    //     if (!child.privateKey) {
    //         throw new Error('Could not obtain private key from derived node');
    //     }
    //     const signingKeyPair = ECPair.fromPrivateKey(Buffer.from(child.privateKey));
    //     const signature = liquid.script.signature.encode(
    //         signingKeyPair.sign(pset.getInputPreimage(i, liquid.Transaction.SIGHASH_ALL)),
    //         liquid.Transaction.SIGHASH_ALL,
    //     );
    //     signatures.push(signature);
    //     signer.addSignature(
    //         i,
    //         {
    //             partialSig: {
    //                 pubkey: signingKeyPair.publicKey,
    //                 signature,
    //             },
    //         },
    //         liquid.Pset.ECDSASigValidator(ecc),
    //     );
    // }

    // console.log('Signed inputs');
    // console.log(pset);
  }