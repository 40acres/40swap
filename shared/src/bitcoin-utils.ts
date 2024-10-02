import { Network, payments, Psbt, script, Signer, Transaction } from 'bitcoinjs-lib';
import { witnessStackToScriptWitness } from 'bitcoinjs-lib/src/psbt/psbtutils.js';

export function signContractSpend({ psbt, preImage, key, network }: {
    psbt: Psbt,
    preImage: Buffer,
    key: Signer,
    network: Network,
}): void {
    psbt.signInput(0, key, [Transaction.SIGHASH_ALL]);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    psbt.finalizeInput(0, (inputIndex, input, arg2, isSegwit, isP2SH, isP2WSH): {
        finalScriptSig: Buffer | undefined;
        finalScriptWitness: Buffer | undefined;
    } => {
        if (input.partialSig == null) {
            throw new Error('partialSig cannot be null');
        }
        const redeemPayment = payments.p2wsh({
            network,
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
}