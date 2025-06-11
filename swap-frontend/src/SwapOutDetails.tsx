import { Component, createEffect, createResource, createSignal, Match, onCleanup, Show, Switch } from 'solid-js';
import { Button, Table } from 'solid-bootstrap';
import { applicationContext } from './ApplicationContext.js';
import { A, useParams } from '@solidjs/router';
import successImage from '/success-image.png?url';
import lightningLogo from '/lightning-logo.svg?url';
import { QrCode } from './QrCode.js';
import Fa from 'solid-fa';
import { faArrowRotateBack, faCopy } from '@fortawesome/free-solid-svg-icons';
import { Spinner } from './Spinner.js';
import failureImage from '/failure-image.png?url';
import { currencyFormat } from './utils.js';
import { toast } from 'solid-toast';
import { PersistedSwapOut, SwapService } from '@40swap/shared';

export const SwapOutDetails: Component = () => {
    const { localSwapStorageService } = applicationContext;

    const [config] = createResource(() => applicationContext.config);
    const params = useParams();
    const { id: swapId } = params;

    const [currentSwap, setCurrentSwap] = createSignal<PersistedSwapOut>();

    const lightningLink = (): string => `lightning:${currentSwap()?.invoice}`;
    let trackerInitialized = false;

    createEffect(() => {
        const c = config();
        if (c != null && !trackerInitialized) {
            const service = new SwapService({
                network: c.bitcoinNetwork,
                baseUrl: '',
                persistence: localSwapStorageService,
            });
            const swapOut = service.trackSwapOut({
                id: swapId,
            });
            trackerInitialized = true;
            swapOut.on('change', (newStatus: PersistedSwapOut) => {
                setCurrentSwap(newStatus);
            });
            swapOut.on('error', (errorType: 'CLAIM', error: Error) => {
                if (errorType === 'CLAIM') {
                    toast.error('Error while claiming the on-chain funds');
                    console.error(`Error while requesting refund: ${error.message}`);
                }
            });
            swapOut.start();
            onCleanup(() => swapOut.stop());
        }
    });

    return (
        <>
            <Show when={currentSwap()?.status === 'DONE' && currentSwap()?.outcome === 'SUCCESS' && currentSwap()?.chain === 'BITCOIN'}>
                <h3 class="text-center" style="text-transform: none">
                    You have successfully swapped Lightning to Bitcoin!
                </h3>
            </Show>
            <Show when={currentSwap()?.status === 'DONE' && currentSwap()?.outcome === 'SUCCESS' && currentSwap()?.chain === 'LIQUID'}>
                <h3 class="text-center" style="text-transform: none">
                    You have successfully swapped Lightning to Liquid!
                </h3>
            </Show>
            <div class="d-flex flex-column gap-3">
                <Show when={currentSwap()?.status === 'DONE' && currentSwap()?.outcome === 'SUCCESS'}>
                    <img src={successImage} class="align-self-center" />
                </Show>
                <Show when={currentSwap()?.status === 'DONE' && currentSwap()?.outcome === 'REFUNDED'}>
                    <img src={failureImage} class="align-self-center" />
                </Show>
                <Show when={currentSwap()}>
                    {(s) => (
                        <>
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
                                                <td>{currencyFormat(s().inputAmount)}</td>
                                            </tr>
                                            <tr>
                                                <th>Amount received:</th>
                                                <td>{currencyFormat(s().outputAmount)}</td>
                                            </tr>
                                        </Match>
                                        <Match when={s().status === 'DONE' && s().outcome === 'REFUNDED'}>
                                            <tr>
                                                <th>Status:</th>
                                                <td>Failed. The funds have been refunded to 40swap</td>
                                            </tr>
                                        </Match>
                                        <Match when={s().status === 'CONTRACT_FUNDED_UNCONFIRMED'}>
                                            <tr>
                                                <th>Status:</th>
                                                <td>Funds locked on-chain, waiting for confirmation</td>
                                            </tr>
                                        </Match>
                                        <Match when={s().status === 'CONTRACT_REFUNDED_UNCONFIRMED'}>
                                            <tr>
                                                <th>Status:</th>
                                                <td>40swap requested a refund, waiting for on-chain confirmation</td>
                                            </tr>
                                        </Match>
                                        <Match when={s().status === 'CONTRACT_CLAIMED_UNCONFIRMED'}>
                                            <tr>
                                                <th>Status:</th>
                                                <td>The on-chain funds have been sent to you, waiting for confirmation</td>
                                            </tr>
                                        </Match>
                                        <Match when={s().status === 'DONE' && s().outcome === 'EXPIRED'}>
                                            <tr>
                                                <th>Status:</th>
                                                <td>Expired</td>
                                            </tr>
                                        </Match>
                                    </Switch>
                                </tbody>
                            </Table>

                            <Switch
                                fallback={
                                    <div class="d-flex flex-column align-items-center pt-5 gap-4">
                                        <Spinner />
                                        <div class="text-muted">Completing the swap</div>
                                    </div>
                                }
                            >
                                <Match when={s().status === 'CREATED'}>
                                    <div class="d-flex justify-content-center">
                                        <QrCode data={lightningLink()} image={lightningLogo} />
                                    </div>
                                    <div class="d-flex flex-grow-1 flex-shrink-0 gap-2">
                                        <a
                                            href={lightningLink()}
                                            class="btn btn-primary"
                                            role="button"
                                            onclick={() => toast.success('Opening lightning wallet')}
                                        >
                                            Pay
                                        </a>
                                        <Button
                                            onclick={async () => {
                                                await navigator.clipboard.writeText(s().invoice);
                                                toast.success('Invoice copied to clipboard');
                                            }}
                                        >
                                            <Fa icon={faCopy} /> Copy invoice
                                        </Button>
                                    </div>
                                </Match>
                                <Match when={s().status === 'DONE'}>
                                    <A href="/" class="btn btn-primary">
                                        <Fa icon={faArrowRotateBack} /> Start new swap
                                    </A>
                                </Match>
                            </Switch>
                        </>
                    )}
                </Show>
            </div>
        </>
    );
};
