import { address, networks, payments, Psbt, script, Transaction } from 'bitcoinjs-lib';
import assert from 'node:assert';
import { witnessStackToScriptWitness } from 'bitcoinjs-lib/src/psbt/psbtutils.js';
import { z } from 'zod';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
const ECPair = ECPairFactory(ecc);

const argsSchema = z.tuple([z.string(),z.string(), z.string(), z.string(), z.string(), z.string(), z.string(), z.string()]);
const [,,contractAddress, lockTxHex, sweepAddress, lockScriptHex, claimKeyHex, preImageHex] = argsSchema.parse(process.argv);

const preImage = Buffer.from(preImageHex, 'hex');
const claimKey = ECPair.fromPrivateKey(Buffer.from(claimKeyHex, 'hex'));
const lockScript = Buffer.from(lockScriptHex, 'hex');
const lockTx = Transaction.fromHex(lockTxHex);
const spendingOutput = lockTx.outs
    .map((value, index) => ({ ...value, index }))
    .find(o => {
        try {
            return address.fromOutputScript(o.script, networks.regtest) === contractAddress;
        } catch (e) {
            return false;
        }
    });
assert(spendingOutput != null);


const network = networks.regtest;

const psbt = new Psbt({ network });
psbt.addOutput({
    address: sweepAddress,
    value: spendingOutput.value - 200, // TODO calculate fee
});

const p2wsh = payments.p2wsh({ redeem: { output: lockScript, network }, network });
psbt.addInput({
    hash: lockTx.getHash(),
    index: spendingOutput.index,
    witnessScript: lockScript,
    witnessUtxo: {
        script: p2wsh.output!,
        value: spendingOutput.value,
    },
});
psbt.signInput(0, ECPair.fromPrivateKey(claimKey.privateKey!), [Transaction.SIGHASH_ALL]);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
psbt.finalizeInput(0, (inputIndex, input, arg2, isSegwit, isP2SH, isP2WSH): {
    finalScriptSig: Buffer | undefined;
    finalScriptWitness: Buffer | undefined;
} => {
    assert(input.partialSig != null);
    const redeemPayment = payments.p2wsh({
        redeem: {
            input: script.compile([
                input.partialSig[0].signature,
                preImage,
            ]),
            output: input.witnessScript,
        },
    });

    const finalScriptWitness = witnessStackToScriptWitness(
        redeemPayment.witness ?? []
    );

    return {
        finalScriptSig: Buffer.from(''),
        finalScriptWitness,
    };
});
console.log(`tx: ${psbt.extractTransaction().toHex()}`);
