import { Component, createSignal } from 'solid-js';
import { Button, Form } from 'solid-bootstrap';
import Decimal from 'decimal.js';
import { getSwapOutResponseSchema, SwapOutRequest } from '@40swap/shared';
import { applicationContext } from './ApplicationContext.js';
import { useNavigate } from '@solidjs/router';

export const SwapOutForm: Component = () =>  {
    const [amount, setAmount] = createSignal<number>();
    const [sweepAddress, setSweepAddress] = createSignal('');
    const navigate = useNavigate();

    async function startSwap(): Promise<void> {
        const { swapOutService, ECPair} = applicationContext;

        const randomBytes = crypto.getRandomValues(new Uint8Array(32));
        const preImage = Buffer.from(randomBytes);
        const claimKey = ECPair.makeRandom();
        const localSwapDetails = {
            preImage: preImage.toString('hex'),
            hash: (await sha256(preImage)).toString('hex'),
            claimKey: claimKey.privateKey!.toString('hex'),
            sweepAddress: sweepAddress()!,
        };

        const resp = await fetch('/api/swap/out', {
            method: 'POST',
            body: JSON.stringify({
                inputAmount: new Decimal(amount()!).div(1e8).toDecimalPlaces(8).toNumber(),
                claimPubKey: claimKey.publicKey.toString('hex'),
                preImageHash: localSwapDetails.hash,
            } satisfies SwapOutRequest),
            headers: {
                'content-type': 'application/json',
            },
        });
        if (resp.status >= 300) {
            alert(`Unknown error creating the job. ${JSON.stringify(await resp.json())}`);
            return;
        }
        const swap = getSwapOutResponseSchema.parse(await resp.json());
        await swapOutService.persistLocally({
            ...swap,
            ...localSwapDetails,
        });

        navigate(`/swap/out/${swap.swapId}`);
    }

    async function sha256(message: Buffer): Promise<Buffer> {
        return Buffer.from(await crypto.subtle.digest('SHA-256', message));
    }

    return <>
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
        <Button onClick={startSwap} disabled={amount() == null || sweepAddress() === ''}>Start</Button>
    </>;
};
