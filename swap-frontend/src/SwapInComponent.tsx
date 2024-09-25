import { Component, createEffect, createResource, createSignal, Match, Show, Switch } from 'solid-js';
import { ECPairFactory, ECPairInterface } from 'ecpair';
import { GetSwapInResponse, getSwapInResponseSchema, SwapInRequest } from '@40swap/shared';
import { Alert, Button, Form } from 'solid-bootstrap';
import * as ecc from 'tiny-secp256k1';

const ECPair = ECPairFactory(ecc);

export const SwapInComponent: Component = () => {
    const [invoice, setInvoice] = createSignal('');

    const [currentSwapId, setCurrentSwapId] = createSignal<string>();
    const [currentSwap, { refetch }] = createResource(currentSwapId, id => getSwap(id) );
    const [claimKey, setClaimKey] = createSignal<ECPairInterface>();

    async function startSwap(): Promise<void> {
        setClaimKey(ECPair.makeRandom());
        const resp = await fetch('/api/swap/in', {
            method: 'POST',
            body: JSON.stringify({
                invoice: invoice(),
                refundPublicKey: claimKey()!.publicKey.toString('hex'),
            } satisfies SwapInRequest),
            headers: {
                'content-type': 'application/json',
            },
        });
        if (resp.status >= 300) {
            alert(`Unknown error creating the job. ${JSON.stringify(await resp.json())}`);
            return;
        }
        setCurrentSwapId(getSwapInResponseSchema.parse(await resp.json()).swapId);
    }

    async function getSwap(id: string): Promise<GetSwapInResponse> {
        const resp = await fetch(`/api/swap/in/${id}`);
        return getSwapInResponseSchema.parse(await resp.json());
    }

    createEffect(() => {
        if (currentSwapId() != null) {
            setInterval(refetch, 1000);
        }
    });

    return <>
        <Show when={currentSwap() == null}>
            <Form.Group class="mb-3" controlId="exampleForm.ControlTextarea1">
                <Form.Label>Lightning invoice:</Form.Label>
                <Form.Control as="textarea" rows={5}
                    onChange={e => setInvoice(e.target.value)}
                    onKeyUp={e => setInvoice(e.currentTarget.value)}
                />
            </Form.Group>
            <Button onClick={startSwap}>Start</Button>
        </Show>
        <Show when={currentSwap()}>{s => <>
            <div>Swap id: {s().swapId}</div>
            <Switch>
                <Match when={s().status === 'CREATED'}>
                    <div>Send {s().inputAmount} BTC to: {s()?.address}</div>
                </Match>
                <Match when={s().status === 'CONTRACT_FUNDED'}>
                    <div>Contract funded</div>
                </Match>
                <Match when={s().status === 'INVOICE_PAID'}>
                    <div>Invoice paid</div>
                </Match>
                <Match when={s().status === 'CLAIMED'}>
                    <Alert variant="success">
                        Success
                    </Alert>
                </Match>
            </Switch>
        </>}</Show>
    </>;
};