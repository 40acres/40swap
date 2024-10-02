import { Component, createResource, createSignal, Match, onCleanup, onMount, Show, Switch } from 'solid-js';
import {
    GetSwapInResponse,
    getSwapInResponseSchema,
    psbtResponseSchema,
    signContractSpend,
    TxRequest,
} from '@40swap/shared';
import { Alert, Button, Container, Form } from 'solid-bootstrap';
import { Psbt } from 'bitcoinjs-lib';
import { applicationContext } from './ApplicationContext.js';
import { useParams } from '@solidjs/router';

export const SwapInDetails: Component = () => {
    const { localSwapStorageService, ECPair } = applicationContext;

    const params = useParams();
    const { id: swapId } = params;
    const [currentSwap, { refetch }] = createResource(swapId, id => getSwap(id) );
    const [refundAddress, setRefundAddress] = createSignal('');

    let refunded = false;

    async function startRefund(): Promise<void> {
        const swap = currentSwap();
        const refundPrivateKeyHex = (await localSwapStorageService.findById('in', swapId))?.refundKey;
        if (swap == null || refundPrivateKeyHex == null || refunded) {
            return;
        }
        const refundPrivateKey = Buffer.from(refundPrivateKeyHex, 'hex');
        if (swap.status !== 'CONTRACT_EXPIRED') {
            alert(`invalid state ${swap.status}`);
        }
        refunded = true;
        const network = (await applicationContext.config).bitcoinNetwork;
        const resp = await fetch(`/api/swap/in/${swap.swapId}/refund-psbt?` + new URLSearchParams({
            address: refundAddress(),
        }));
        if (resp.status >= 300) {
            alert(`Unknown error getting refund psbt. ${JSON.stringify(await resp.json())}`);
            return;
        }
        const psbt = Psbt.fromBase64(psbtResponseSchema.parse(await resp.json()).psbt, { network });
        // TODO verify outputs
        signContractSpend({
            psbt,
            network,
            key: ECPair.fromPrivateKey(refundPrivateKey),
            preImage: Buffer.alloc(0),
        });
        const tx = psbt.extractTransaction();
        const resp2 = await fetch(`/api/swap/in/${swap.swapId}/refund-tx`, {
            method: 'POST',
            body: JSON.stringify({
                tx: tx.toHex(),
            } satisfies TxRequest),
            headers: {
                'content-type': 'application/json',
            },
        });
        if (resp2.status >= 300) {
            alert(`Unknown error broadcasting refund tx. ${JSON.stringify(await resp.json())}`);
            return;
        }
    }

    async function getSwap(id: string): Promise<GetSwapInResponse> {
        const resp = await fetch(`/api/swap/in/${id}`);
        return getSwapInResponseSchema.parse(await resp.json());
    }

    let poller: NodeJS.Timeout|undefined;
    onMount(() => poller = setInterval(refetch, 1000));
    onCleanup(() => clearInterval(poller));

    return <>
        <Container>
            <h3>Swap in</h3>
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
                    <Match when={s().status === 'CONTRACT_EXPIRED'}>
                        <div>
                            Expired
                            <Form.Group class="mb-3">
                                <Form.Label>Address to receive refund:</Form.Label>
                                <Form.Control type="text" onInput={e => setRefundAddress(e.target.value)} />
                            </Form.Group>
                            <Button onClick={startRefund}>Refund</Button>
                        </div>
                    </Match>
                    <Match when={s().status === 'REFUNDED'}>
                        <Alert variant="info">Refunded</Alert>
                    </Match>
                </Switch>
            </>}</Show>
        </Container>
    </>;
};