import { address, crypto, Network, payments, Psbt, script, Transaction } from 'bitcoinjs-lib';
import assert from 'node:assert';

export function swapScript(
    preimageHash: Buffer,
    claimPublicKey: Buffer,
    refundPublicKey: Buffer,
    timeoutBlockHeight: number,
): Buffer {
    return script.fromASM(
        `
        OP_HASH160 ${crypto.ripemd160(preimageHash).toString('hex')} OP_EQUAL
        OP_IF
            ${claimPublicKey.toString('hex')}
        OP_ELSE
            ${script.number.encode(timeoutBlockHeight).toString('hex')} OP_CHECKLOCKTIMEVERIFY OP_DROP
            ${refundPublicKey.toString('hex')}
        OP_ENDIF
        OP_CHECKSIG
        `
            .trim()
            .replace(/\s+/g, ' '),
    );
}

export function reverseSwapScript(
    preimageHash: Buffer,
    claimPublicKey: Buffer,
    refundPublicKey: Buffer,
    timeoutBlockHeight: number,
): Buffer {
    return script.fromASM(
        `
        OP_SIZE ${script.number.encode(32).toString('hex')} OP_EQUAL
        OP_IF
            OP_HASH160 ${crypto.ripemd160(preimageHash).toString('hex')} OP_EQUALVERIFY ${claimPublicKey.toString('hex')}
        OP_ELSE
            OP_DROP ${script.number.encode(timeoutBlockHeight).toString('hex')} OP_CHECKLOCKTIMEVERIFY OP_DROP ${refundPublicKey.toString('hex')}
        OP_ENDIF
        OP_CHECKSIG
        `
            .trim()
            .replace(/\s+/g, ' '),
    );
}

export function buildTransactionWithFee(
    satsPerVbyte: number,
    buildFn: (feeAmount: number, isFeeCalculationRun: boolean) => Psbt,
): Psbt {
    const txWithoutAmount = buildFn(1, true).extractTransaction();
    return buildFn(Math.ceil((txWithoutAmount.virtualSize() + txWithoutAmount.ins.length) * satsPerVbyte), false);
}

export function buildContractSpendBasePsbt({ contractAddress, lockScript, network, spendingTx, outputAddress, feeAmount }: {
    contractAddress: string,
    lockScript: Buffer,
    network: Network,
    spendingTx: Transaction,
    outputAddress: string,
    feeAmount: number,
}): Psbt {
    const spendingOutput = spendingTx.outs
        .map((value, index) => ({ ...value, index }))
        .find(o => {
            try {
                return address.fromOutputScript(o.script, network) === contractAddress;
            } catch (e) {
                return false;
            }
        });
    assert(spendingOutput != null);

    const psbt = new Psbt({ network });

    const value = spendingOutput.value - feeAmount;
    if (value <= 1000) { // dust
        throw new Error(`amount is too low: ${value}`);
    }
    psbt.addOutput({
        address: outputAddress,
        value,
    });

    const p2wsh = payments.p2wsh({ redeem: { output: lockScript, network }, network });
    psbt.addInput({
        hash: spendingTx.getHash(),
        index: spendingOutput.index,
        witnessScript: lockScript,
        witnessUtxo: {
            script: p2wsh.output!,
            value: spendingOutput.value,
        },
        sequence: 0xfffffffd, // locktime does not work without this
    });
    return psbt;
}
