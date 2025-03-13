import BIP32Factory from 'bip32';
import * as liquid from 'liquidjs-lib';
import { nbxplorerHotWallet, NbxplorerService } from './NbxplorerService';
import * as ecc from 'tiny-secp256k1';
import { Network } from 'bitcoinjs-lib';
import { liquid as liquidNetwork } from 'liquidjs-lib/src/networks.js';
import { varuint } from 'liquidjs-lib/src/bufferutils.js';
import { ECPairFactory, ECPairInterface } from 'ecpair';

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
    timeoutBlockHeight?: number,
  ): Promise<liquid.Transaction> {
    // get utxos from nbxplorer
    const utxoResponse = await nbxplorer.getUTXOs(xpub, 'lbtc');
    if (!utxoResponse) {
        throw new Error('No UTXOs returned from NBXplorer');
    }

    // get confirmed utxos for input
    const utxos = utxoResponse.confirmed.utxOs;
    // console.log(utxos);
    let totalInputValue = 0;
    const commision = 1000; // 0.1% TODO: get from other source
    const selectedUtxos = [];
    for (const utxo of utxos) {
        selectedUtxos.push(utxo);
        totalInputValue += Number(utxo.value);
        if (totalInputValue >= requiredAmount + commision) {
            break;
        }
    }
    if (totalInputValue < requiredAmount) {
        throw new Error(`Insufficient funds, required ${requiredAmount} but only ${totalInputValue} available`);
    }

    // Create a new pset
    console.log('--------------------------------');
    const pset = liquid.Creator.newPset({locktime: timeoutBlockHeight});
    const updater = new liquid.Updater(pset);
    console.log('New PSET');
    console.log(pset);

    // Add inputs
    console.log('--------------------------------');
    await Promise.all(selectedUtxos.map(async (utxo, i) => {
        const walletTx = await nbxplorer.getWalletTransaction(xpub, utxo.transactionHash, 'lbtc');
        const liquidTx = liquid.Transaction.fromBuffer(Buffer.from(walletTx.transaction, 'hex'));
        const sequence = timeoutBlockHeight ? 0xffffffff : 0x00000000;
        const input = new liquid.CreatorInput(liquidTx.getId(), utxo.index, sequence);
        pset.addInput(input.toPartialInput());
        updater.addInSighashType(i, liquid.Transaction.SIGHASH_ALL);
        updater.addInNonWitnessUtxo(i, liquidTx);        
        // updater.addInRedeemScript(i, Buffer.from(utxo.scriptPubKey, 'hex'));
    }));

    console.log('Added inputs');
    console.log(pset);

    // Add outputs
    console.log('--------------------------------');
    const claimOutputScript = liquid.address.toOutputScript(contractAddress, network);
    const claimOutput = new liquid.CreatorOutput(
        network.assetHash,
        liquid.ElementsValue.fromNumber(Number(requiredAmount)).number,
        claimOutputScript,
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
    const changeOutputScript = liquid.address.toOutputScript(changeAddress.address, network);
    const changeOutput = new liquid.CreatorOutput(
        network.assetHash,
        liquid.ElementsValue.fromNumber(Number(totalInputValue - requiredAmount - commision)).number,
        changeOutputScript,
        blindingKey !== undefined ? Buffer.from(blindingKey) : undefined,
        blindingKey !== undefined ? 0 : undefined
    );
    updater.addOutputs([changeOutput]);

    console.log('Added change output');
    console.log(pset);

    // Add fee output
    console.log('--------------------------------');
    const feeOutput = new liquid.CreatorOutput(network.assetHash, liquid.ElementsValue.fromNumber(Number(commision)).number);
    updater.addOutputs([feeOutput]);

    console.log('Added fee output');
    console.log(pset);

    // Sign inputs
    console.log('--------------------------------');
    const signer = new liquid.Signer(pset);
    const signatures: Buffer[] = [];
    const signingKeys: ECPairInterface[] = [];

    for (let i = 0; i < selectedUtxos.length; i++) {
        const utxo = selectedUtxos[i];
        // TODO: sign inputs without xpriv (using proxied rpc)
        const node = bip32.fromBase58(xpriv, network);
        const child = node.derivePath(utxo.keyPath);
        if (!child.privateKey) {
            throw new Error('Could not obtain private key from derived node');
        }
        const signingKeyPair = ECPair.fromPrivateKey(Buffer.from(child.privateKey));
        signingKeys.push(signingKeyPair);
        const signature = liquid.script.signature.encode(
            signingKeyPair.sign(pset.getInputPreimage(i, liquid.Transaction.SIGHASH_ALL)),
            liquid.Transaction.SIGHASH_ALL,
        );
        signatures.push(signature);
        signer.addSignature(
            i,
            {
                partialSig: {
                    pubkey: signingKeyPair.publicKey,
                    signature,
                },
            },
            liquid.Pset.ECDSASigValidator(ecc),
        );
    }

    console.log('Signed inputs');
    console.log(pset);

    // finalize
    console.log('--------------------------------');
    
    const finalizer = new liquid.Finalizer(pset);

    for (let i = 0; i < selectedUtxos.length; i++) {
        finalizer.finalizeInput(i, () => {
            const finals: {
                finalScriptWitness?: Buffer;
            } = {};

            finals.finalScriptWitness = liquid.witnessStackToScriptWitness([
                signatures[i],
                signingKeys[i].publicKey,
            ]);
            return finals;
        });
    }
    console.log('PSET finalized');
    console.log(pset);

    // extract transaction
    console.log('--------------------------------');
    const transaction = liquid.Extractor.extract(pset);
    console.log('Transaction hex: ', transaction.toHex());
    return transaction;
  }