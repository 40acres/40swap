import { script, crypto } from 'bitcoinjs-lib';

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
