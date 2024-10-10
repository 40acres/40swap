import { Component, createEffect, createMemo, createResource, createSignal, Match, Show, Switch } from 'solid-js';
import { Button, Form, Table } from 'solid-bootstrap';
import { address, networks } from 'bitcoinjs-lib';
import { applicationContext } from './ApplicationContext.js';
import { A, useParams } from '@solidjs/router';
import Fa from 'solid-fa';
import { faArrowRotateBack, faCopy } from '@fortawesome/free-solid-svg-icons';
import { QrCode } from './QrCode.js';
import bitcoinLogo from '/assets/bitcoin-logo.svg';
import successImage from '/assets/success-image.svg';
import failureImage from '/assets/failure-image.svg';
import { createTimer } from '@solid-primitives/timer';
import { Spinner } from './Spinner.js';
import { ActionButton } from './ActionButton.js';
import { jsonEquals } from './utils.js';
import { toast } from 'solid-toast';

export const SwapInDetails: Component = () => {
    const { swapInService, localSwapStorageService } = applicationContext;

    const [bitcoinConfig] = createResource(() => applicationContext.config);
    const params = useParams();
    const { id: swapId } = params;
    const [remoteSwap, { refetch }] = createResource(swapId, id => swapInService.getSwap(id) );
    const currentSwap = createMemo(remoteSwap, undefined, { equals: jsonEquals });
    const [refundAddress, setRefundAddress] = createSignal('');

    createTimer(refetch, () => ['CLAIMED', 'REFUNDED'].includes(currentSwap()?.status ?? '') ? false : 1000, setInterval);

    createEffect(async () => {
        const swap = currentSwap();
        if (swap != null) {
            await localSwapStorageService.update(swap);
        }
    });

    function isInvalidRefundAddress(): boolean {
        if (refundAddress() === '') {
            return false;
        }
        const network = bitcoinConfig()?.bitcoinNetwork ?? networks.bitcoin;
        try {
            address.toOutputScript(refundAddress(), network);
            return false;
        } catch (e) {
            return true;
        }
    }

    async function startRefund(): Promise<void> {
        const swap = currentSwap();
        if (swap == null || swap.refundRequestDate != null) {
            return;
        }
        try {
            await swapInService.getRefund(swap, refundAddress());
            await localSwapStorageService.update({ type: 'in', swapId: swap.swapId, refundRequestDate: new Date() });
            refetch();
        } catch (e) {
            toast.error('Unknown error');
        }
    }

    const bip21Address = (): string => `bitcoin:${currentSwap()?.address}?amount=${currentSwap()?.inputAmount}`;

    return <>
        <Switch
            fallback={<h3 class="fw-bold">Swap bitcoin to lightning</h3>}
        >
            <Match when={currentSwap()?.status === 'CLAIMED'}>
                <h3 class="text-center" style="text-transform: none">You have successfully swapped Bitcoin to Lightning!</h3>
            </Match>
            <Match when={currentSwap()?.status === 'REFUNDED'}>
                <h3 class="text-center" style="text-transform: none">Transaction failed. Please try again.</h3>
            </Match>
        </Switch>

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
                                    <td>Waiting for your payment</td>
                                </tr>
                                <tr>
                                    <th>Amount to be paid:</th>
                                    <td>{s().inputAmount} BTC</td>
                                </tr>
                                <tr>
                                    <th>Send to:</th>
                                    <td class="text-break">{s().address}</td>
                                </tr>
                            </Match>
                            <Match when={s().status === 'CLAIMED'}>
                                <tr>
                                    <th>Status:</th>
                                    <td>Success</td>
                                </tr>
                                <tr>
                                    <th>Amount sent:</th>
                                    <td>{s().inputAmount}</td>
                                </tr>
                                <tr>
                                    <th>Amount received:</th>
                                    <td>{s().inputAmount}</td>{/* TODO output amount */}
                                </tr>
                            </Match>
                            <Match when={s().status === 'CONTRACT_FUNDED'}>
                                <tr>
                                    <th>Status:</th>
                                    <td>Contract funded, waiting for 40swap to pay the invoice</td>
                                </tr>
                            </Match>
                            <Match when={s().status === 'INVOICE_PAID'}>
                                <tr>
                                    <th>Status:</th>
                                    <td>Lightning invoice paid, claiming on-chain tx</td>
                                </tr>
                            </Match>
                            <Match when={s().status === 'CONTRACT_EXPIRED'}>
                                <tr>
                                    <th>Status:</th>
                                    <td>{
                                        s().refundRequestDate == null ?
                                            'On-chain contract expired. Please, initiate a refund' :
                                            'On-chain contract expired. Refund is in-progress'
                                    }</td>
                                </tr>
                            </Match>
                            <Match when={s().status === 'REFUNDED'}>
                                <tr>
                                    <th>Status:</th>
                                    <td>Failed. The funds have been refunded to you</td>
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
                            <QrCode data={bip21Address()} image={bitcoinLogo}/>
                        </div>
                        <div class="d-flex flex-grow-1 flex-shrink-0 gap-2">
                            <a href={bip21Address()} class="btn btn-primary" role="button">Pay</a>
                            <Button onclick={() => navigator.clipboard.writeText(s().inputAmount.toString())}>
                                <Fa icon={faCopy}/> Copy amount
                            </Button>
                            <Button onclick={() => navigator.clipboard.writeText(s().address.toString())}>
                                <Fa icon={faCopy}/> Copy address
                            </Button>
                        </div>
                    </Match>
                    <Match when={s().status === 'CLAIMED' || s().status === 'REFUNDED'}>
                        <A href="/" class="btn btn-primary"><Fa icon={faArrowRotateBack}/> Start new swap</A>
                    </Match>
                    <Match when={s().status === 'CONTRACT_EXPIRED' && s().refundRequestDate == null}>
                        <div>
                            <Form.Group class="mb-3">
                                <Form.Control type="text" placeholder="Enter bitcoin address to receive refund"
                                    value={refundAddress()}
                                    onChange={e => setRefundAddress(e.target.value)}
                                    onKeyUp={e => setRefundAddress(e.currentTarget.value)}
                                    isInvalid={isInvalidRefundAddress()}
                                />
                            </Form.Group>
                            <ActionButton action={() => startRefund()} disabled={refundAddress() === '' || isInvalidRefundAddress()}>Get refund</ActionButton>
                        </div>
                    </Match>
                </Switch>
            </>}</Show>
        </div>
    </>;
};