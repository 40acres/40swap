import { Component, createEffect, createMemo, createResource, Match, Show, Switch } from 'solid-js';
import { Button, Table } from 'solid-bootstrap';
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
import { jsonEquals } from './utils.js';
import { toast } from 'solid-toast';


export const SwapOutDetails: Component = () => {
    const { swapOutService, localSwapStorageService } = applicationContext;

    const params = useParams();
    const { id: swapId } = params;

    const [remoteSwap, { refetch }] = createResource(swapId, id => swapOutService.getSwap(id));
    const currentSwap = createMemo(remoteSwap, undefined, { equals: jsonEquals });
    createTimer(refetch, () => currentSwap()?.status !== 'DONE' ? 1000 : false, setInterval);

    const lightningLink = (): string => `lightning:${currentSwap()?.invoice}`;

    createEffect(async () => {
        const swap = currentSwap();
        if (swap == null || swap.claimRequestDate != null) {
            return;
        }
        if (swap.status === 'CONTRACT_FUNDED') {
            try {
                await swapOutService.claim(swap);
                await localSwapStorageService.update({ type: 'out', swapId: swap.swapId, claimRequestDate: new Date()});
                refetch();
            } catch (e) {
                console.log('unhandled error', e);
                toast.error('Unknown error');
            }
        }
    });

    createEffect(async () => {
        const swap = currentSwap();
        if (swap != null) {
            await localSwapStorageService.update(swap);
        }
    });

    return <>
        <Show when={currentSwap()?.status === 'DONE' && currentSwap()?.outcome === 'SUCCESS'}
            fallback={<h3 class="fw-bold">Swap lightning to bitcoin</h3>}>
            <h3 class="text-center" style="text-transform: none">You have successfully swapped Lightning to Bitcoin!</h3>
        </Show>
        <div class="d-flex flex-column gap-3">
            <Show when={currentSwap()?.status === 'DONE' && currentSwap()?.outcome === 'SUCCESS'}>
                <img src={successImage} style="height: 212px" />
            </Show>
            <Show when={currentSwap()?.status === 'DONE' && currentSwap()?.outcome === 'REFUNDED'}>
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
                            <Match when={s().status === 'DONE' && s().outcome === 'SUCCESS'}>
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
                            <Match when={s().status === 'DONE' && s().outcome === 'REFUNDED'}>
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
                    <Match when={s().status === 'DONE'}>
                        <A href="/" class="btn btn-primary"><Fa icon={faArrowRotateBack} /> Start new swap</A>
                    </Match>
                </Switch>
            </>}</Show>
        </div>
    </>;
};