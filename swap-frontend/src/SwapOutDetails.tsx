import { Component, createEffect, createMemo, createResource, Match, Show, Switch } from 'solid-js';
import { Button, Table } from 'solid-bootstrap';
import { GetSwapOutResponse, getSwapOutResponseSchema, psbtResponseSchema, signContractSpend, TxRequest } from '@40swap/shared';
import { Psbt } from 'bitcoinjs-lib';
import { applicationContext } from './ApplicationContext.js';
import { A, useParams } from '@solidjs/router';
import successImage from './assets/success-image.svg';
import lightningLogo from './assets/lightning-logo.svg';
import { QrCode } from './QrCode.js';
import Fa from 'solid-fa';
import { faArrowRotateBack, faCopy } from '@fortawesome/free-solid-svg-icons';
import { createTimer } from '@solid-primitives/timer';
import { Spinner } from './Spinner.js';
import failureImage from './assets/failure-image.svg';


export const SwapOutDetails: Component = () => {
    const { localSwapStorageService, ECPair } = applicationContext;

    const params = useParams();
    const { id: swapId } = params;

    const [remoteSwap, { refetch }] = createResource(swapId, id => getSwap(id));
    const currentSwap = createMemo(
        remoteSwap,
        null,
        { equals: (prev, next) => JSON.stringify(prev) === JSON.stringify(next)},
    );
    createTimer(refetch, () => currentSwap()?.status !== 'CLAIMED' ? 1000 : false, setInterval);

    const lightningLink = (): string => `lightning:${currentSwap()?.invoice}`;
    let claimed = false;
    createEffect(async () => {
        const swap = currentSwap();
        const localDetails = await localSwapStorageService.findById('out', swapId);
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
            signContractSpend({
                psbt,
                network,
                key: ECPair.fromPrivateKey(Buffer.from(localDetails.claimKey, 'hex')),
                preImage: Buffer.from(localDetails.preImage, 'hex'),
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
                alert(`error claiming: ${await resp.text()}`);
            }
        }
    });

    async function getSwap(id: string): Promise<GetSwapOutResponse> {
        const resp = await fetch(`/api/swap/out/${id}`);
        return getSwapOutResponseSchema.parse(await resp.json());
    }

    return <>
        <Show when={currentSwap()?.status === 'CLAIMED'}
            fallback={<h3 class="fw-bold">Swap lightning to bitcoin</h3>}>
            <h3 class="text-center" style="text-transform: none">You have successfully swapped Lightning to Bitcoin!</h3>
        </Show>
        <div class="d-flex flex-column gap-3">
            <Show when={currentSwap()?.status === 'CLAIMED'}>
                <img src={successImage} style="height: 212px" />
            </Show>
            <Show when={currentSwap()?.status === 'REFUNDED'}>
                <img src={failureImage} style="height: 212px" />
            </Show>
            <Show when={currentSwap()}>{s => <>
                <Table class="swap-details-table">
                    <tbody>
                        <tr>
                            <th>Transaction No:</th>
                            <td>{s().swapId}</td>
                        </tr>
                        <Switch>
                            <Match when={s().status === 'CREATED'}>
                                <tr>
                                    <th>Status:</th>
                                    <td>Waiting for your lightning payment</td>
                                </tr>
                                {/* TODO show amount to be paid */}
                            </Match>
                            <Match when={s().status === 'INVOICE_PAYMENT_INTENT_RECEIVED'}>
                                <tr>
                                    <th>Status:</th>
                                    <td>Received lightning payment. Publishing lock-up transaction</td>
                                </tr>
                            </Match>
                            <Match when={s().status === 'CONTRACT_FUNDED'}>
                                <tr>
                                    <th>Status:</th>
                                    <td>Funds locked-up on-chain. Claiming funds to your receiving address</td>
                                </tr>
                            </Match>
                            <Match when={s().status === 'CONTRACT_EXPIRED'}>
                                <tr>
                                    <th>Status:</th>
                                    <td>On-chain contract expired. Refunding to 40swap</td>
                                </tr>
                            </Match>
                            <Match when={s().status === 'CLAIMED'}>
                                <tr>
                                    <th>Status:</th>
                                    <td>Success</td>
                                </tr>
                                <tr>
                                    <th>Amount sent:</th>
                                    <td>{s().outputAmount}</td>{/* TODO input amount */}
                                </tr>
                                <tr>
                                    <th>Amount received:</th>
                                    <td>{s().outputAmount}</td>
                                </tr>
                            </Match>
                            <Match when={s().status === 'REFUNDED'}>
                                <tr>
                                    <th>Status:</th>
                                    <td>Failed. The funds have been refunded to 40swap</td>
                                </tr>
                            </Match>
                        </Switch>
                    </tbody>
                </Table>

                <Switch fallback={
                    <div class="d-flex flex-column align-items-center pt-5 gap-4">
                        <Spinner/>
                        <div class="text-muted">Completing the swap</div>
                    </div>
                }>
                    <Match when={s().status === 'CREATED'}>
                        <div class="d-flex justify-content-center">
                            <QrCode data={lightningLink()} image={lightningLogo}/>
                        </div>
                        <div class="d-flex flex-grow-1 flex-shrink-0 gap-2">
                            <a href={lightningLink()} class="btn btn-primary" role="button">Pay</a>
                            <Button onclick={() => navigator.clipboard.writeText(s().invoice)}>
                                <Fa icon={faCopy}/> Copy invoice
                            </Button>
                        </div>
                    </Match>
                    <Match when={s().status === 'CLAIMED' || s().status === 'REFUNDED'}>
                        <A href="/" class="btn btn-primary"><Fa icon={faArrowRotateBack} /> Start new swap</A>
                    </Match>
                </Switch>
            </>}</Show>
        </div>
    </>;
};