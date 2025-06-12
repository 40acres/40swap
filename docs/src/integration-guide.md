# Integration guide

Let's describe how an existing application would integrate the 40swap API to  

All the code examples are provided in Javascript, using the [bitcoinjs library](https://github.com/bitcoinjs/bitcoinjs-lib),
but hopefully they are clear enough to that they can be easily translated into any language.

## Swap-in

We will convert some of our on-chain bitcoin to lightning.
The first thing to do is generate a random key-pair to make sure we can recover the funds if anything goes wrong:
```js
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';

const ECPair = ECPairFactory(ecc);
const refundKey = ECPair.makeRandom();
```
Then, we obtain a lightning invoice, and create the swap using the API:
```js
const invoice = ''; // you need to obtain this externally
const BASE_URL = 'https://app.40swap.com'

const response = await fetch(`${BASE_URL}/api/swap/in`, {
    method: 'POST',
    body: JSON.stringify({
        invoice,
        refundPublicKey: refundKey.publicKey.toString('hex'),
        chain: 'BITCOIN',
    }),
    headers: {
        'content-type': 'application/json',
    },
});

if (response.status >= 300) {
    throw new Error(`Unknown error creating swap-in. ${await resp.text()}`);
}
const swapIn = await resp.json();
```
Now, get the payment instructions and make the on-chain payment:
```js
console.log(`Pay ${swapIn.inputAmount} BTC to ${swapIn.contractAddress}`);
```
And simply wait for the swap-in to become `DONE`, by polling the `GET` endpoint:
```js
let status;
while (status !== 'DONE') {
    const r = await fetch(`${BASE_URL}/api/swap/in/${swapIn.swapId}`);
    const s = await r.json();
    status = s.status;
    await setTimeout(new Promise(resolve => setTimeout(1000, resolve)));
}
console.log(`Congratulations! Swap ${swapIn.swapId} is ${swap.outcome}!`);
```

### Refund

If 40swap fails to pay the lightning invoice, be it because of lack of liquidity or for any other reason, the swap will
not complete. Instead, after a number of blocks have been mined, it will reach the status `CONTRACT_EXPIRED`.

Once in this status, we should be able to get a refund of the funds we sent on-chain. The easiest way to do this is by
getting a PSBT from 40swap, and then signing it locally, but you can also build and sign the transaction locally:
```js
import { Psbt } from 'bitcoinjs-lib';
import { witnessStackToScriptWitness } from 'bitcoinjs-lib/src/psbt/psbtutils.js';

const refundAddress = ''; // you can obtain this one from your wallet, for instance
const resp = await fetch(`${BASE_URL}/api/swap/in/${swap.swapId}/refund-psbt?${refundAddress}`);
const psbt = Psbt.fromBase64((await resp.json()).psbt);
// here you should check that the psbt does actually pay the full amount to your address
// ...
psbt.signInput(0, refundKey, [Transaction.SIGHASH_ALL]);
psbt.finalizeInput(0, (inputIndex, input) => {
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
```
And finally broadcast the signed transaction to the blockchain. For this, you can use your own instance of bitcoind, or
call the 40swap API:
```js
const tx = psbt.extractTransaction();
const resp = await fetch(`${BASE_URL}/api/swap/in/${swap.swapId}/refund-tx`, {
    method: 'POST',
    body: JSON.stringify({ tx: tx.toHex() }),
    headers: {
        'content-type': 'application/json',
    },
});
```
After the tx is broadcast, the swap should end up in state `DONE` with outcome `REFUNDED`.

# Swap-out

A swap-out can be used to convert bitcoin from lightning to on-chain. 

The flow is a bit more complex that the swap-in, but similar in many ways.
In this case, we start by creating a random preimage and its hash:
```js
const randomBytes = crypto.getRandomValues(new Uint8Array(32));
const preImage = Buffer.from(randomBytes);
const preImageHash = await Buffer.from(await crypto.subtle.digest('SHA-256', preImage));
```
And a key that will be used to claim the on-chain funds:
```js
const claimKey = this.ECPair.makeRandom();
```
Then, call the 40swap API to create the swap, and pay the lightning invoice:
```js
const resp = await fetch(`${BASE_URL}/api/swap/out`, {
    method: 'POST',
    body: JSON.stringify({
        inputAmount: 0.12, // set the amount you want to swap
        claimPubKey: claimKey.publicKey.toString('hex'),
        preImageHash: preImageHash.toString('hex'),
        chain,
    }),
    headers: {
        'content-type': 'application/json',
    },
});
const swapOut = (await resp.json());
const { invoice } = swap; // this is the invoice you have to pay
```
At this point, the lightning invoice has not been accepted by 40swap yet (it can't because it doesn't have the preimage),
but it will send the on-chain funds to the contract address.
When this happens, the swap status will change to 'CONTRACT_FUNDED', and you can claim the funds to your own address.
```js
// wait until swap state is 'CONTRACT_FUNDED'
while (status !== 'CONTRACT_FUNDED') {
    const r = await fetch(`${BASE_URL}/api/swap/out/${swapOut.swapId}`);
    const s = await r.json();
    status = s.status;
    await setTimeout(new Promise(resolve => setTimeout(1000, resolve)));
}
// claim the funds on-chain
const claimAddress = ''; // this is where you want to receive the funds from the swap
const psbtResp = await fetch(`${BASE_URL}/api/swap/out/${swapId}/claim-psbt?${claimAddress}`);
const psbt = Psbt.fromBase64((await psbtResp.json()).psbt);
// here you should check that the psbt does actually pay the full amount to your address
// ...

// sign the PSBT
psbt.signInput(0, claimKey, [Transaction.SIGHASH_ALL]);
psbt.finalizeInput(0, (inputIndex, input) => {
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

// and broadcast it
const tx = psbt.extractTransaction();
const resp = await fetch(`${BASE_URL}/api/swap/out/${swap.swapId}/claim`, {
    method: 'POST',
    body: JSON.stringify({ tx: tx.toHex() }),
    headers: {
        'content-type': 'application/json',
    },
});
```
If everything went ok, your swap should end up in status `DONE` with outcome `SUCCESS` after the claim tx is confirmed by the blockchain.

### Refund

In this case, it's 40swap that puts the funds on-chain, so in case of failure, the refund will be completely handled by 40swap.
From the user perspective, all they'll see is that the lightning payment fails and the swap moves its status to `DONE` with
outcome `REFUNDED`.
