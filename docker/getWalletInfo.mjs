#!/usr/bin/env node
/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/explicit-function-return-type */

import * as bip39 from 'bip39';
import { BIP32Factory } from 'bip32';
import { SLIP77Factory } from 'slip77';
import * as ecc from 'tiny-secp256k1';
import {ECPairFactory} from 'ecpair';
import {
    networks,
    payments,
    address,
} from 'liquidjs-lib';


// CLI arg parsing
const args = process.argv.slice(2);
if (args.length < 3) {
    console.error(`
Uso:
  node deriveWalletInfo.mjs "<mnemonic>" <slip77_hex> [passphrase] [derivation_path] [count]

Parámetros:
  mnemonic         - Frase mnemónica entre comillas
  slip77_hex       - Clave maestra de blinding en hexadecimal
  passphrase       - (opcional) Passphrase BIP39
  derivation_path  - (opcional) Default: "m/84'/1'/0'/0"
  count            - (opcional) Cuántas direcciones derivar (default: 5)

Ejemplo:
  node deriveWalletInfo.mjs "survey liberty enlist ..." a1d24c4cacae... "" "m/84'/1'/0'/0" 3
`);
    process.exit(1);
}

const [mnemonic, slip77Hex, passphrase = '', derivationPath = 'm/84\'/1\'/0\'/0', countStr = '5'] = args;
const count = parseInt(countStr, 10);

const network = networks.regtest;
const ECPair = ECPairFactory(ecc);
const bip32 = BIP32Factory(ecc);

async function main() {
    const seed = await bip39.mnemonicToSeed(mnemonic, passphrase);
    const master = bip32.fromSeed(seed, network);

    const slip77 = SLIP77Factory(ecc).fromMasterBlindingKey(slip77Hex);

    console.log(`\n👉 Derivando ${count} direcciones desde: ${derivationPath}\n`);

    for (let i = 0; i < count; i++) {
        const path = `${derivationPath}/${i}`;
        const child = master.derivePath(path);
        const keyPair = ECPair.fromPrivateKey(Buffer.from(child.privateKey));

        const payment = payments.p2wpkh({ pubkey: keyPair.publicKey, network });
        const script = payment.output;
        const unconfidential = address.fromOutputScript(script, network);

        const blindKey = slip77.derive(script);
        const confidential = address.toConfidential(unconfidential, blindKey.publicKey);

        console.log(`📍 Derivation path: ${path}`);
        console.log(`🔐 WIF: ${keyPair.toWIF()}`);
        console.log(`📬 Address (unconfidential): ${unconfidential}`);
        console.log(`🔒 Address (confidential): ${confidential}`);
        console.log(`🕶️ Blinding key (hex): ${blindKey.privateKey.toString('hex')}`);

        console.log('\n📋 Import commands:');
        console.log(`elements-cli importprivkey ${keyPair.toWIF()}`);
        console.log(`elements-cli importblindingkey ${confidential} ${blindKey.privateKey.toString('hex')}`);
        console.log('---');
    }
}

main().catch(console.error);