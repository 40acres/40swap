import { Component, createEffect, createResource, createSignal, Match, Show, Switch } from 'solid-js';
import { Alert, Button, Container, Form, Navbar } from 'solid-bootstrap';
import Fa from 'solid-fa';
import { faAddressBook } from '@fortawesome/free-solid-svg-icons';
import './app.scss';
import { render } from 'solid-js/web';
import { GetSwapInResponse, getSwapInResponseSchema, SwapInRequest } from '@40swap/shared';
import { ECPairFactory, ECPairInterface } from 'ecpair';
import * as ecc from 'tiny-secp256k1';

const ECPair = ECPairFactory(ecc);

const App: Component = () => {
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
        <Navbar class="mb-4" expand="lg" collapseOnSelect>
            <Container>
                <Navbar.Brand class="fs-2">
                    <Fa icon={faAddressBook} size="lg" /> 40Swap
                </Navbar.Brand>
            </Container>
        </Navbar>
        <Container fluid id='main'>
            <div style="width: 450px" class="border border-primary mx-auto p-3">
                <h2>Swap In</h2>
                <Show when={currentSwap() == null}>
                    <Form.Group class="mb-3" controlId="exampleForm.ControlTextarea1">
                        <Form.Label>Invoice</Form.Label>
                        <Form.Control as="textarea" rows={5}
                            onChange={e => setInvoice(e.target.value)}
                            onKeyUp={e => setInvoice(e.currentTarget.value)}
                        />
                    </Form.Group>
                    <Button onClick={startSwap}>Send</Button>
                </Show>
                <Show when={currentSwap()}>{s => <>
                    <div>Swap id: {s().swapId}</div>
                    <Switch>
                        <Match when={s().status === 'CREATED'}>
                            <div>Send bitcoins to: {currentSwap()?.address}</div>
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
            </div>
        </Container>
    </>;
};

render(() => <App />, document.getElementById('root') as HTMLElement);
