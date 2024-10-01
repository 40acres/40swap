import { Component, createSignal } from 'solid-js';
import { Button, Form } from 'solid-bootstrap';
import { getSwapInResponseSchema, SwapInRequest } from '@40swap/shared';
import { applicationContext } from './ApplicationContext.js';
import { useNavigate } from '@solidjs/router';

export const SwapInForm: Component = () => {
    const [invoice, setInvoice] = createSignal('');
    const navigate = useNavigate();

    async function startSwap(): Promise<void> {
        const refundKey = applicationContext.ECPair.makeRandom();
        const resp = await fetch('/api/swap/in', {
            method: 'POST',
            body: JSON.stringify({
                invoice: invoice(),
                refundPublicKey: refundKey.publicKey.toString('hex'),
            } satisfies SwapInRequest),
            headers: {
                'content-type': 'application/json',
            },
        });
        if (resp.status >= 300) {
            alert(`Unknown error starting swap-in. ${JSON.stringify(await resp.json())}`);
            return;
        }

        const swap = getSwapInResponseSchema.parse(await resp.json());
        await applicationContext.localSwapStorageService.persist({
            type: 'in',
            ...swap,
            refundKey: refundKey.privateKey!.toString('hex'),
        });
        navigate(`/swap/in/${swap.swapId}`);
    }

    return <>
        <Form.Group class="mb-3" controlId="exampleForm.ControlTextarea1">
            <Form.Label>Lightning invoice:</Form.Label>
            <Form.Control as="textarea" rows={5}
                onChange={e => setInvoice(e.target.value)}
                onKeyUp={e => setInvoice(e.currentTarget.value)}
            />
        </Form.Group>
        <Button onClick={startSwap}>Start</Button>
    </>;
};