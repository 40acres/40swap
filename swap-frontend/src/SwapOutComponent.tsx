import { Component, createEffect, createResource, createSignal, Match, Show, Switch } from 'solid-js';
import { Alert, Button, Form } from 'solid-bootstrap';
import {
    GetSwapOutResponse,
    getSwapOutResponseSchema,
    psbtResponseSchema,
    SwapOutRequest,
    TxRequest,
} from '@40swap/shared';
import { ECPairFactory, ECPairInterface } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import { payments, Psbt, script, Transaction } from 'bitcoinjs-lib';
import { witnessStackToScriptWitness } from 'bitcoinjs-lib/src/psbt/psbtutils.js';
import Decimal from 'decimal.js';
import { applicationContext } from './ApplicationContext.js';

const ECPair = ECPairFactory(ecc);

export const SwapOutComponent: Component = () => {
    const [amount, setAmount] = createSignal<number>();
    const [sweepAddress, setSweepAddress] = createSignal('');
    const [currentSwapId, setCurrentSwapId] = createSignal<string>();
    const [currentSwap, { refetch }] = createResource(currentSwapId, id => getSwap(id));
    const [localSwapDetails, setLocalSwapDetails] = createSignal<{ preImage: Buffer, hash: Buffer, claimKey: ECPairInterface}>();
    let claimed = false;


    async function startSwap(): Promise<void> {
        const randomBytes = crypto.getRandomValues(new Uint8Array(32));
        const preImage = Buffer.from(randomBytes);
        const localSwapDetails = {
            preImage,
            hash: await sha256(preImage),
            claimKey: ECPair.makeRandom(),
        };
        setLocalSwapDetails(localSwapDetails);

        const resp = await fetch('/api/swap/out', {
            method: 'POST',
            body: JSON.stringify({
                inputAmount: new Decimal(amount()!).div(1e8).toDecimalPlaces(8).toNumber(),
                claimPubKey: localSwapDetails.claimKey.publicKey.toString('hex'),
                preImageHash: localSwapDetails.hash.toString('hex'),
            } satisfies SwapOutRequest),
            headers: {
                'content-type': 'application/json',
            },
        });
        if (resp.status >= 300) {
            alert(`Unknown error creating the job. ${JSON.stringify(await resp.json())}`);
            return;
        }
        const response = getSwapOutResponseSchema.parse(await resp.json());
        setCurrentSwapId(response.swapId);
    }

    async function sha256(message: Buffer): Promise<Buffer> {
        return Buffer.from(await crypto.subtle.digest('SHA-256', message));
    }


    createEffect(() => {
        if (currentSwapId() != null) {
            setInterval(refetch, 1000);
        }
    });

    createEffect(async () => {
        const swap = currentSwap();
        const localDetails = localSwapDetails();
        const address = sweepAddress();
        if (swap == null || localDetails == null || sweepAddress() == null || claimed) {
            return;
        }
        if (swap.status === 'CONTRACT_FUNDED') {
            if (swap.lockTx == null) {
                return;
            }
            const resp = await fetch(`/api/swap/out/${swap.swapId}/claim-psbt?` + new URLSearchParams({
                address,
            }));
            if (resp.status >= 300) {
                alert(`error claiming: ${await resp.text()}`);
            }

            const network = (await applicationContext.config).bitcoinNetwork;
            const psbt = Psbt.fromBase64(psbtResponseSchema.parse(await resp.json()).psbt, { network });
            // TODO validate output
            psbt.signInput(0, localDetails.claimKey, [Transaction.SIGHASH_ALL]);
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            psbt.finalizeInput(0, (inputIndex, input, arg2, isSegwit, isP2SH, isP2WSH): {
                finalScriptSig: Buffer | undefined;
                finalScriptWitness: Buffer | undefined;
            } => {
                if (input.partialSig == null) {
                    throw new Error();
                }
                const redeemPayment = payments.p2wsh({
                    redeem: {
                        input: script.compile([
                            input.partialSig[0].signature,
                            localDetails.preImage,
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
            const claimTx = psbt.extractTransaction();
            const resp2 = await fetch(`/api/swap/out/${swap.swapId}/claim`, {
                method: 'POST',
                body: JSON.stringify({
                    tx: claimTx.toHex(),
                } satisfies TxRequest),
                headers: {
                    'content-type': 'application/json',
                },
            });
            claimed = true;
            if (resp2.status >= 300) {
                alert(`error claiming: ${resp.text()}`);
            }
        }
    });

    async function getSwap(id: string): Promise<GetSwapOutResponse> {
        const resp = await fetch(`/api/swap/out/${id}`);
        return getSwapOutResponseSchema.parse(await resp.json());
    }

    return <>
        <Show when={currentSwap() == null}>
            <Form.Group class="mb-3">
                <Form.Label>Amount (sats):</Form.Label>
                <Form.Control type="number"
                    step={1} min={1}
                    onInput={e => setAmount(Number(e.target.value))}
                />
            </Form.Group>
            <Form.Group class="mb-3">
                <Form.Label>Address to receive funds:</Form.Label>
                <Form.Control type="text"
                    onInput={e => setSweepAddress(e.target.value)}
                />
            </Form.Group>
            <Button onClick={startSwap} disabled={amount() == null}>Start</Button>
        </Show>
        <Show when={currentSwap()}>{s => <>
            <div>Swap id: {s().swapId}</div>
            <Switch>
                <Match when={s().status === 'CREATED'}>
                    <div>
                        Pay the following invoice:
                        <Alert variant={'light'}>
                            <pre style="white-space: pre-wrap; word-wrap: break-word;">{s().invoice}</pre>
                        </Alert>
                    </div>
                </Match>
                <Match when={s().status === 'INVOICE_PAYMENT_INTENT_RECEIVED'}>
                    <div>Sending the money on-chain</div>
                </Match>
                <Match when={s().status === 'CONTRACT_FUNDED'}>
                    <div>Claiming swap to your receiving address</div>
                </Match>
                <Match when={s().status === 'CLAIMED'}>
                    <Alert variant="success">Success</Alert>
                </Match>
                <Match when={s().status === 'CONTRACT_EXPIRED'}>
                    Expired. Refunding to 40 swap.
                </Match>
                <Match when={s().status === 'REFUNDED'}>
                    <Alert variant="danger">Failed</Alert>
                </Match>
            </Switch>
        </>}</Show>
    </>;
};