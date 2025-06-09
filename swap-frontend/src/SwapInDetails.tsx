import { Component, createEffect, createResource, createSignal, Match, onCleanup, Show, Switch } from 'solid-js';
import { Button, Form, Table } from 'solid-bootstrap';
import { address, networks } from 'bitcoinjs-lib';
import { applicationContext } from './ApplicationContext.js';
import { A, useParams } from '@solidjs/router';
import Fa from 'solid-fa';
import { faArrowRotateBack, faCopy } from '@fortawesome/free-solid-svg-icons';
import { QrCode } from './QrCode.js';
import bitcoinLogo from '/bitcoin-logo.svg?url';
import successImage from '/success-image.png?url';
import failureImage from '/failure-image.png?url';
import lockOpenImage from '/lock-open.svg?url';
import liquidLogo from '/liquid-logo.svg?url';
import { Spinner } from './Spinner.js';
import { ActionButton } from './ActionButton.js';
import { currencyFormat } from './utils.js';
import { toast } from 'solid-toast';
import * as liquid from 'liquidjs-lib';
import { getLiquidNetworkFromBitcoinNetwork, PersistedSwapIn, SwapService } from '@40swap/shared';

export const SwapInDetails: Component = () => {
    const { localSwapStorageService } = applicationContext;

    const [config] = createResource(() => applicationContext.config);
    const params = useParams();
    const { id: swapId } = params;
    const [currentSwap, setCurrentSwap] = createSignal<PersistedSwapIn>();

    const [refundAddress, setRefundAddress] = createSignal('');

    const { resolve: resolveRefundAddress, promise: refundAddressPromise } = Promise.withResolvers<string>();
    let trackerInitialized = false;

    createEffect(() => {
        const c = config();
        if (c != null && !trackerInitialized) {
            const service = new SwapService({
                network: c.bitcoinNetwork,
                baseUrl: '',
                persistence: localSwapStorageService,
            });
            const swapIn = service.trackSwapIn({
                id: swapId,
                refundAddress: () => refundAddressPromise,
            });
            trackerInitialized = true;
            swapIn.on('change', (newStatus: PersistedSwapIn) => {
                setCurrentSwap(newStatus);
            });
            swapIn.on('error', (errorType: 'REFUND', error: Error) => {
                if (errorType === 'REFUND') {
                    toast.error('Error while requesting refund');
                    console.error(`Errror while requesting refund: ${error.message}`);
                }
            });
            swapIn.start();
            onCleanup(() => swapIn.stop());
        }
    });

    function isInvalidRefundAddress(): boolean {
        if (refundAddress() === '') {
            return false;
        }
        const network = config()?.bitcoinNetwork ?? networks.bitcoin;
        if (currentSwap()?.chain === 'BITCOIN') {
            try {
                address.toOutputScript(refundAddress(), network);
                return false;
            } catch (e) {
                return true;
            }
        } else if (currentSwap()?.chain === 'LIQUID') {
            try {
                liquid.address.toOutputScript(refundAddress(), getLiquidNetworkFromBitcoinNetwork(network));
                return false;
            } catch (e) {
                return true;
            }
        }
        return false;
    }

    async function startRefund(): Promise<void> {
        toast.loading('Processing refund request...', { duration: 3000 });
        resolveRefundAddress(refundAddress());
    }

    const bip21Address = (): string => `bitcoin:${currentSwap()?.contractAddress}?amount=${currentSwap()?.inputAmount}`;
    const liquidNetwork = getLiquidNetworkFromBitcoinNetwork(config()?.bitcoinNetwork ?? networks.bitcoin);
    const liquidBip21Address = (): string => `liquidnetwork:${currentSwap()?.contractAddress}?amount=${currentSwap()?.inputAmount}&assetid=${liquidNetwork.assetHash}`;

    return <>
        <Switch
            fallback={<h3 class="fw-bold">Swap {currentSwap()?.chain?.toLowerCase()} to lightning</h3>}
        >
            <Match when={currentSwap()?.status === 'DONE' && currentSwap()?.outcome === 'SUCCESS' && currentSwap()?.chain === 'BITCOIN'}>
                <h3 class="text-center" style="text-transform: none">You have successfully swapped Bitcoin to Lightning!</h3>
            </Match>
            <Match when={currentSwap()?.status === 'DONE' && currentSwap()?.outcome === 'SUCCESS' && currentSwap()?.chain === 'LIQUID'}>
                <h3 class="text-center" style="text-transform: none">You have successfully swapped Liquid to Lightning!</h3>
            </Match>
            <Match when={currentSwap()?.status === 'DONE' && currentSwap()?.outcome === 'REFUNDED'}>
                <h3 class="text-center" style="text-transform: none">Transaction failed. Please try again.</h3>
            </Match>
        </Switch>

        <div class="d-flex flex-column gap-3">
            <Show when={currentSwap()?.status === 'DONE' && currentSwap()?.outcome === 'SUCCESS'}>
                <img src={successImage} class="align-self-center" />
            </Show>
            <Show when={currentSwap()?.status === 'DONE' && currentSwap()?.outcome === 'REFUNDED'}>
                <img src={failureImage} class="align-self-center" />
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
                                    <td class="text-break">{s().contractAddress}</td>
                                </tr>
                            </Match>
                            <Match when={s().status === 'CONTRACT_AMOUNT_MISMATCH_UNCONFIRMED' || s().status === 'CONTRACT_AMOUNT_MISMATCH'}>
                                <tr>
                                    <th>Status:</th>
                                    <td>Wrong amount detected. Once the onchain contract expires, you'll be able to request a refund</td>
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
                            <Match when={s().status === 'DONE' && s().outcome === 'REFUNDED'}>
                                <tr>
                                    <th>Status:</th>
                                    <td>Failed. The funds have been refunded to you</td>
                                </tr>
                            </Match>
                            <Match when={s().status === 'CONTRACT_FUNDED_UNCONFIRMED'}>
                                <tr>
                                    <th>Status:</th>
                                    <td>On-chain payment detected, waiting for confirmation</td>
                                </tr>
                            </Match>
                            <Match when={s().status === 'CONTRACT_REFUNDED_UNCONFIRMED'}>
                                <tr>
                                    <th>Status:</th>
                                    <td>The refund to you has been sent, waiting for on-chain confirmation</td>
                                </tr>
                            </Match>
                            <Match when={s().status === 'CONTRACT_CLAIMED_UNCONFIRMED'}>
                                <tr>
                                    <th>Status:</th>
                                    <td>40swap has paid your lightning invoice and claimed the on-chain funds, waiting for confirmation</td>
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
                <Switch fallback={
                    <div class="d-flex flex-column align-items-center pt-5 gap-4">
                        <Spinner/>
                        <div class="text-muted">Completing the swap</div>
                    </div>
                }>
                    <Match when={s().status === 'CREATED' && s().chain === 'BITCOIN'}>
                        <div class="d-flex justify-content-center">
                            <QrCode data={bip21Address()} image={bitcoinLogo}/>
                        </div>
                        <div class="d-flex flex-grow-1 flex-shrink-0 gap-2">
                            <a href={bip21Address()} class="btn btn-primary" role="button" onclick={() => toast.success('Opening Bitcoin wallet')}>Pay</a>
                            <Button onclick={() => {
                                navigator.clipboard.writeText(s().inputAmount.toString());
                                toast.success('Amount copied to clipboard');
                            }}>
                                <Fa icon={faCopy}/> Copy amount
                            </Button>
                            <Button onclick={() => {
                                navigator.clipboard.writeText(s().contractAddress.toString());
                                toast.success('Address copied to clipboard');
                            }}>
                                <Fa icon={faCopy}/> Copy address
                            </Button>
                        </div>
                    </Match>
                    <Match when={s().status === 'CREATED' && s().chain === 'LIQUID'}>
                        <div class="d-flex justify-content-center">
                            <QrCode data={liquidBip21Address()} image={liquidLogo}/>
                        </div>
                        <div class="d-flex flex-grow-1 flex-shrink-0 gap-2">
                            <a href={liquidBip21Address()} class="btn btn-primary" role="button" onclick={() => toast.success('Opening Liquid wallet')}>Pay</a>
                            <Button onclick={() => {
                                navigator.clipboard.writeText(s().inputAmount.toString());
                                toast.success('Amount copied to clipboard');
                            }}>
                                <Fa icon={faCopy}/> Copy amount
                            </Button>
                            <Button onclick={() => {
                                navigator.clipboard.writeText(s().contractAddress.toString());
                                toast.success('Address copied to clipboard');
                            }}>
                                <Fa icon={faCopy}/> Copy address
                            </Button>
                        </div>
                    </Match>
                    <Match when={s().status === 'DONE'}>
                        <A href="/" class="btn btn-primary"><Fa icon={faArrowRotateBack}/> Start new swap</A>
                    </Match>
                    <Match when={s().status === 'CONTRACT_EXPIRED' && s().refundRequestDate == null}>
                        <div>
                            <Form.Group class="mb-3">
                                <Form.Control 
                                    type="text" 
                                    placeholder={`Enter ${s().chain.toLowerCase()} address to receive refund`}
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
                <Show when={s().contractAddress && s().chain === 'BITCOIN'}>
                    <a class="action-link" href={`${config()?.mempoolDotSpaceUrl}/address/${s().contractAddress}`} target="_blank">
                        <img src={lockOpenImage} class="me-2" />Open lockup address
                    </a>
                </Show>
                <Show when={s().contractAddress && s().chain === 'LIQUID'}>
                    <a class="action-link" href={`${config()?.esploraUrl}/address/${s().contractAddress}`} target="_blank">
                        <img src={lockOpenImage} class="me-2" />Open lockup address
                    </a>
                </Show>
            </>}</Show>
        </div>
    </>;
};