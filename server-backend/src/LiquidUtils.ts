import BIP32Factory from 'bip32';
import * as liquid from 'liquidjs-lib';
import { nbxplorerHotWallet, NbxplorerService } from './NbxplorerService';
import * as ecc from 'tiny-secp256k1';
import { Network, Psbt } from 'bitcoinjs-lib';
import { liquid as liquidNetwork } from 'liquidjs-lib/src/networks.js';
const bip32 = BIP32Factory(ecc);

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
    requiredAmount: number,       // amount (in satoshis) to send to the contract address
    contractAddress: string,      // the address derived from your custom lockScript
    changeAddress: string,        // your change address
    network: typeof liquidNetwork,// e.g., liquid.network or liquid.regtest
    nbxplorer: NbxplorerService,
    keyPair: {
        pubKey: Uint8Array,
        privKey: Uint8Array
    },                            // key pair to sign the inputs
  ): Promise<string> {
    // get utxos from nbxplorer
    const utxoResponse = await nbxplorer.getUTXOs(xpub, 'lbtc');
    if (!utxoResponse) throw new Error('No UTXOs returned from NBXplorer');
  
    const psbt = new Psbt({ network });

    return psbt.toHex();
  }