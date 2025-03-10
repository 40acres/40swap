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

export async function buildLiquidPsbt(
    xpub: string,
    xpriv: string,
    requiredAmount: number,
    contractAddress: string,
    unlockPrivKey: Buffer,
    network: typeof liquidNetwork,
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
        if (totalInputValue >= requiredAmount) {
            break;
        }
    }
    if (totalInputValue < requiredAmount) {
        throw new Error(`Insufficient funds, required ${requiredAmount} but only ${totalInputValue} available`);
    }

    // Add inputs to psbt
    selectedUtxos.forEach((utxo) => {
        psbt.addInput({
            hash: utxo.transactionHash,
            index: utxo.index,
            witnessUtxo: {
                script: Buffer.from(utxo.scriptPubKey, 'hex'),
                value: liquid.ElementsValue.fromNumber(utxo.value).bytes,
                nonce: Buffer.alloc(32, 0),
                asset: Buffer.concat([
                    Buffer.from(network.assetHash, 'hex'),
                    Buffer.alloc(1, 0),
                ]),
            },
        });
    });
    console.log('--------------------------------');
    console.log('Added inputs');
    console.log(psbt);
  
    // Add an output sending the required amount to the contract address (derived from your lockScript)
    psbt.addOutput({
        script: liquid.address.toOutputScript(contractAddress, network),
        value: liquid.ElementsValue.fromNumber(requiredAmount).bytes,
        nonce: Buffer.alloc(32, 0),
        asset: Buffer.concat([
            Buffer.from(network.assetHash, 'hex'),
            Buffer.alloc(1, 0),
        ]),
    });
    console.log('--------------------------------');
    console.log('Added outputs');
    console.log(psbt);
  
    // Add a change output
    
    const changeValue = totalInputValue - requiredAmount;
    if (changeValue > 0) {
        const keyPair = ECPair.fromPrivateKey(unlockPrivKey);
        const changeP2wpkh = liquid.payments.p2wpkh({ pubkey: keyPair.publicKey, network });
        psbt.addOutput({
            script: liquid.address.toOutputScript(changeP2wpkh.address!, network),
            value: liquid.ElementsValue.fromNumber(changeValue).bytes,
            nonce: Buffer.alloc(32, 0),
            asset: Buffer.concat([
                Buffer.from(network.assetHash, 'hex'),
                Buffer.alloc(1, 0),
            ]),
        });
    }
    console.log('--------------------------------');
    console.log('Added change outputs');
    console.log(psbt);
  
    // Sign each input with your keyPair
    for (const utxo of selectedUtxos) {
        const node = bip32.fromBase58(xpriv, network);
        const child = node.derivePath(utxo.keyPath);
        if (!child.privateKey) {
          throw new Error('No se pudo obtener la clave privada del nodo derivado');
        }
        const signingKeyPair = ECPair.fromPrivateKey(Buffer.from(child.privateKey));
        psbt.signInput(utxo.index, signingKeyPair);
    }
    console.log('--------------------------------');
    console.log('Signed inputs');
    console.log(psbt);
  
    // Finalize all inputs and extract the fully signed transaction
    psbt.finalizeAllInputs();
    console.log('Finalized inputs');
    console.log(psbt);
    console.log('--------------------------------');
    console.log('Extracting transaction');
    const tx = psbt.extractTransaction();
    console.log('Transaction', tx);
    console.log('--------------------------------');
    console.log('TX FINALIZED :)');
    return tx;
}