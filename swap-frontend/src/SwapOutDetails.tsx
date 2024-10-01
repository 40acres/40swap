import { Component, createEffect, createResource, Match, onCleanup, onMount, Show, Switch } from 'solid-js';
import { Alert, Container } from 'solid-bootstrap';
import { GetSwapOutResponse, getSwapOutResponseSchema, psbtResponseSchema, TxRequest } from '@40swap/shared';
import { payments, Psbt, script, Transaction } from 'bitcoinjs-lib';
import { witnessStackToScriptWitness } from 'bitcoinjs-lib/src/psbt/psbtutils.js';
import { applicationContext } from './ApplicationContext.js';
import { useParams } from '@solidjs/router';


export const SwapOutDetails: Component = () => {
    const { swapOutService, ECPair } = applicationContext;

    const params = useParams();
    const { id: swapId } = params;

    const [currentSwap, { refetch }] = createResource(swapId, id => getSwap(id));
    let claimed = false;

    createEffect(async () => {
        const swap = currentSwap();
        const localDetails = await swapOutService.findLocally(swapId);
        if (swap == null || localDetails == null || claimed) {
            return;
        }
        if (swap.status === 'CONTRACT_FUNDED') {
            if (swap.lockTx == null) {
                return;
            }
            const resp = await fetch(`/api/swap/out/${swap.swapId}/claim-psbt?` + new URLSearchParams({
                address: localDetails.sweepAddress,
            }));
            if (resp.status >= 300) {
                alert(`error claiming: ${await resp.text()}`);
            }

            const network = (await applicationContext.config).bitcoinNetwork;
            const psbt = Psbt.fromBase64(psbtResponseSchema.parse(await resp.json()).psbt, { network });
            // TODO validate output
            psbt.signInput(0, ECPair.fromPrivateKey(Buffer.from(localDetails.claimKey, 'hex')), [Transaction.SIGHASH_ALL]);
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
                            Buffer.from(localDetails.preImage, 'hex'),
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

    let poller: NodeJS.Timeout|undefined;
    onMount(() => poller = setInterval(refetch, 1000));
    onCleanup(() => clearInterval(poller));

    return <>
        <Container>
            <h3>Swap out</h3>
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
        </Container>
    </>;
};