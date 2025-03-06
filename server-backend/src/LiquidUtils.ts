import BIP32Factory from 'bip32';
import * as liquid from 'liquidjs-lib';
import { nbxplorerHotWallet, NbxplorerService } from './NbxplorerService';
import * as ecc from 'tiny-secp256k1';
import { Network } from 'bitcoinjs-lib';
import { Psbt } from 'liquidjs-lib/src/psbt.js';
import { liquid as liquidNetwork } from 'liquidjs-lib/src/networks.js';
import { ECPairFactory } from 'ecpair';

const bip32 = BIP32Factory(ecc);
const ECPair = ECPairFactory(ecc);

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

export function satoshiToBuffer(value: number): Buffer {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(BigInt(value));
    return buf;
}

export async function buildLiquidPsbt(
    xpub: string, requiredAmount: number,
    contractAddress: string,
    changeAddress: string,
    network: typeof liquidNetwork,
    signerPrivKey: Buffer,
    nbxplorer: NbxplorerService,
  ): Promise<liquid.Transaction> {
    // get utxos from nbxplorer
    const utxoResponse = await nbxplorer.getUTXOs(xpub, 'lbtc');
    if (!utxoResponse) {
        throw new Error('No UTXOs returned from NBXplorer');
    }

    const psbt = new Psbt({ network });
    console.log(psbt);

    // get confirmed utxos for input
    const utxos = utxoResponse.confirmed.utxOs;
    console.log(utxos);
    let totalInputValue = 0;
    const selectedUtxos = [];
    for (const utxo of utxos) {
        selectedUtxos.push(utxo);
        totalInputValue += utxo.value;
        if (totalInputValue >= requiredAmount) break;
    }
    if (totalInputValue < requiredAmount) {
        throw new Error('Insufficient funds');
    }

    // // Add inputs to psbt
    selectedUtxos.forEach((utxo) => {
        psbt.addInput({
            hash: utxo.transactionHash,
            index: utxo.index,
            witnessUtxo: {
                script: Buffer.from(utxo.scriptPubKey, 'hex'),
                value: satoshiToBuffer(utxo.value),
                nonce: Buffer.alloc(32, 0),
                asset: Buffer.from(network.assetHash, 'hex'),
            },
        });
    });
  
    // Add an output sending the required amount to the contract address (derived from your lockScript)
    psbt.addOutput({
        script: liquid.address.toOutputScript(contractAddress, network),
        value: satoshiToBuffer(requiredAmount),
        nonce: Buffer.alloc(32, 0),
        asset: Buffer.from(network.assetHash, 'hex'),
    });
  
    // Add a change output
    const changeValue = totalInputValue - requiredAmount;
    if (changeValue > 0) {
        psbt.addOutput({
            script: liquid.address.toOutputScript(changeAddress, network),
            value: satoshiToBuffer(changeValue),
            nonce: Buffer.alloc(32, 0),
            asset: Buffer.from(network.assetHash, 'hex'),
        });
    }
  
    // Sign each input with your keyPair
    for (let i = 0; i < selectedUtxos.length; i++) {
        psbt.signInput(i, ECPair.fromPrivateKey(signerPrivKey));
    }
  
    // Finalize all inputs and extract the fully signed transaction
    psbt.finalizeAllInputs();
    return psbt.extractTransaction();
}