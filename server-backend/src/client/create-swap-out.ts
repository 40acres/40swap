import { createHash, randomBytes } from 'node:crypto';
import { SwapOutRequest, swapOutResponseSchema } from '../api.js';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';

const ECPair = ECPairFactory(ecc);

const preimage = randomBytes(32);
const hash = createHash('sha256').update(preimage).digest();
console.log(`preimage: ${preimage.toString('hex')}`);
console.log(`hash: ${hash.toString('hex')}`);

const claimKey = ECPair.makeRandom();
console.log(`pub: ${claimKey.publicKey.toString('hex')}`);
console.log(`priv: ${claimKey.privateKey!.toString('hex')}`);

const r = await fetch('http://localhost:7081/swap/out', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        claimPubKey: claimKey.publicKey.toString('hex'),
        inputAmount: 0.00100500,
        preImageHash: hash.toString('hex'),
    } satisfies SwapOutRequest),
});

const response = swapOutResponseSchema.parse(await r.json());
console.log(`response: \n ${JSON.stringify(response, null, 2)}`);