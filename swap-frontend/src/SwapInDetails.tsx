import { Component, createMemo, createResource, createSignal, Match, Show, Switch } from 'solid-js';
import { GetSwapInResponse, getSwapInResponseSchema, psbtResponseSchema, signContractSpend, TxRequest } from '@40swap/shared';
import { Button, Form, Table } from 'solid-bootstrap';
import { address, networks, Psbt } from 'bitcoinjs-lib';
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

export const SwapInDetails: Component = () => {
    const { localSwapStorageService, ECPair } = applicationContext;

    const [bitcoinConfig] = createResource(() => applicationContext.config);
    const params = useParams();
    const { id: swapId } = params;
    const [remoteSwap, { refetch }] = createResource(swapId, id => getSwap(id) );
    const currentSwap = createMemo(
        remoteSwap,
        null,
        { equals: (prev, next) => JSON.stringify(prev) === JSON.stringify(next)},
    );
    const [refundAddress, setRefundAddress] = createSignal('');

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

    createTimer(refetch, () => ['CLAIMED', 'REFUNDED'].includes(currentSwap()?.status ?? '') ? false : 1000, setInterval);

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

    const bip21Address = (): string => `bitcoin:${currentSwap()?.address}?amount=${currentSwap()?.inputAmount}`;

    async function getSwap(id: string): Promise<GetSwapInResponse> {
        const resp = await fetch(`/api/swap/in/${id}`);
        return getSwapInResponseSchema.parse(await resp.json());
    }

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
                                    <td>On-chain contract expired. Please, initiate a refund</td>
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
                    <Match when={s().status === 'CONTRACT_EXPIRED'}>
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