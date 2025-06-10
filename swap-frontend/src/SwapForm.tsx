import { Component, createEffect, createResource, createSignal, Show } from 'solid-js';
import { Form } from 'solid-bootstrap';
import flipImg from '/flip.png?url';
import { currencyFormat, SwapType } from './utils.js';
import { createStore } from 'solid-js/store';
import { decode } from 'bolt11';
import { applicationContext } from './ApplicationContext.js';
import { useNavigate } from '@solidjs/router';
import Decimal from 'decimal.js';
import { ActionButton } from './ActionButton.js';
import { toast } from 'solid-toast';
import { FrontendConfiguration, getLiquidNetworkFromBitcoinNetwork, getSwapInInputAmount, getSwapOutOutputAmount } from '@40swap/shared';
import Fa from 'solid-fa';
import { faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import { toOutputScript } from 'bitcoinjs-lib/src/address.js';
import { toOutputScript as toOutputScriptLiquid } from 'liquidjs-lib/src/address.js';
import { AssetSelector } from './components/AssetSelector.jsx';
import { Asset } from './controllers/AssetController.js';

type FormData = {
    inputAmount: number;
    from: Asset;
    to: Asset;
    payload: string;
};

export const SwapForm: Component = () => {
    const { swapInService, swapOutService } = applicationContext;
    const navigate = useNavigate();
    const [config] = createResource(() => applicationContext.config);
    const [destinationAsset, setDestinationAsset] = createSignal<Asset>('ON_CHAIN_BITCOIN');
    const [errorMessage, setErrorMessage] = createSignal('');
    const [validated, setValidated] = createSignal(false);

    const [form, setForm] = createStore<FormData>({
        from: 'ON_CHAIN_BITCOIN',
        to: 'LIGHTNING_BITCOIN',
        payload: '',
        inputAmount: 0,
    });

    const [formErrors, setFormErrors] = createStore<{ [key in keyof FormData]: boolean } & { outputAmount: boolean }>({
        inputAmount: false,
        from: false,
        to: false,
        outputAmount: false,
        payload: false,
    });

    function swapType(): SwapType {
        const toAsset = form.to;
        if (toAsset === 'ON_CHAIN_BITCOIN' || toAsset === 'ON_CHAIN_LIQUID') {
            return 'out';
        } else if (toAsset === 'LIGHTNING_BITCOIN') {
            return 'in';
        }
        throw new Error('Invalid asset');
    }

    function outputAmount(): number {
        if (swapType() === 'in') {
            if (form.payload !== '') {
                try {
                    const invoice = decode(form.payload);
                    if (invoice.satoshis != null) {
                        return new Decimal(invoice.satoshis).div(1e8).toDecimalPlaces(8).toNumber();
                    }
                } catch (e) {
                    // empty
                }
            }
            return 0;
        } else {
            const conf = config();
            if (conf == null) {
                return 0;
            }
            return getSwapOutOutputAmount(new Decimal(inputAmount()), new Decimal(conf.feePercentage)).toNumber();
        }
    }

    function inputAmount(): number {
        if (swapType() === 'in') {
            const conf = config();
            if (conf == null) {
                return 0;
            }
            return getSwapInInputAmount(new Decimal(outputAmount()), new Decimal(conf.feePercentage)).toNumber();
        } else {
            return form.inputAmount;
        }
    }

    function fee(): number {
        return new Decimal(inputAmount()).minus(outputAmount()).toDecimalPlaces(8).toNumber();
    }

    function flipAssets(): void {
        setForm({
            from: form.to,
            to: form.from,
            inputAmount: 0,
        });
    }

    function updateAssets(from: Asset, to: Asset): void {
        setForm({
            from,
            to,
            inputAmount: 0,
            payload: '',
        });
    }

    function isValid(field: keyof FormData | 'outputAmount'): boolean {
        // if we wanted to show the valid markers, uncomment this line
        // return validated() && !formErrors[field];
        return false;
    }

    function isInvalid(field: keyof FormData | 'outputAmount'): boolean {
        return validated() && formErrors[field];
    }

    function validateInputAmount(conf: FrontendConfiguration): void {
        const isInvalidInputAmount = inputAmount() < conf.minimumAmount || inputAmount() > conf.maximumAmount;
        setFormErrors('inputAmount', isInvalidInputAmount);
        if (isInvalidInputAmount) {
            setErrorMessage('Invalid amount');
        }
    }

    function validateOutputAmount(conf: FrontendConfiguration): void {
        const isInvalidOutputAmount = outputAmount() < conf.minimumAmount || outputAmount() > conf.maximumAmount;
        setFormErrors('outputAmount', isInvalidOutputAmount);
        if (isInvalidOutputAmount) {
            setErrorMessage('Invalid amount');
        }
    }

    function validateLightningInvoice(invoice: string): void {
        try {
            decode(invoice);
            setFormErrors('payload', false);
        } catch (e) {
            setFormErrors('payload', true);
            setErrorMessage('Invalid invoice');
        }
    }

    function validateBitcoinAddress(btcAddress: string, conf: FrontendConfiguration): void {
        try {
            toOutputScript(btcAddress, conf.bitcoinNetwork);
            setFormErrors('payload', false);
        } catch (error) {
            setFormErrors('payload', true);
            setErrorMessage('Invalid bitcoin address');
        }
    }

    function validateLiquidAddress(address: string, conf: FrontendConfiguration): void {
        try {
            toOutputScriptLiquid(address, getLiquidNetworkFromBitcoinNetwork(conf.bitcoinNetwork));
            setFormErrors('payload', false);
        } catch (e) {
            setFormErrors('payload', true);
            setErrorMessage('Invalid liquid address');
        }
    }
    async function validate(): Promise<void> {
        const conf = config();
        if (conf == null) {
            return;
        }
        setErrorMessage('');
        if (swapType() === 'in') {
            validateInputAmount(conf);
            validateOutputAmount(conf);
            validateLightningInvoice(form.payload);
        } else {
            validateInputAmount(conf);
            validateOutputAmount(conf);
            if (form.to === 'ON_CHAIN_LIQUID') {
                validateLiquidAddress(form.payload, conf);
            } else if (form.to === 'ON_CHAIN_BITCOIN') {
                validateBitcoinAddress(form.payload, conf);
            }
        }
        setValidated(true);
    }

    function hasErrors(): boolean {
        return formErrors.from || formErrors.to || formErrors.inputAmount || formErrors.outputAmount || formErrors.payload;
    }

    function isSendable(): boolean {
        return !hasErrors() && form.payload !== '';
    }

    async function createSwap(): Promise<void> {
        await validate();
        if (hasErrors()) {
            return;
        }
        try {
            if (swapType() === 'in') {
                const chain = form.from === 'ON_CHAIN_BITCOIN' ? 'BITCOIN' : 'LIQUID';
                const swap = await swapInService.createSwap(form.payload, chain);
                navigate(`/swap/in/${swap.swapId}`);
            } else if (swapType() === 'out') {
                const chain = form.to === 'ON_CHAIN_BITCOIN' ? 'BITCOIN' : 'LIQUID';
                const swap = await swapOutService.createSwap(form.payload, inputAmount(), chain);
                navigate(`/swap/out/${swap.swapId}`);
            }
        } catch (e) {
            toast.error('Unknown error');
        }
    }

    createEffect(() => {
        if (validated()) {
            validate();
        }
    });

    createEffect(() => {
        const toAsset = form.to;
        setDestinationAsset(toAsset);
    }, [form.to]);

    return (
        <>
            <h3 class="fw-bold">Create a Swap</h3>
            <div class="d-flex flex-column gap-3">
                <div class="d-flex gap-2">
                    <div class="bg-light d-flex flex-column p-4" style="flex: 1 1 0">
                        <div class="fw-medium">
                            <AssetSelector selectedAsset={form.from} counterpartyAsset={form.to} onAssetSelect={(asset) => updateAssets(asset, form.to)} />
                        </div>
                        <hr />
                        <div class="fs-6">You send</div>
                        <div>
                            <input
                                class="form-control form-control-lg inline-input"
                                step={0.001}
                                max={2}
                                type="number"
                                value={inputAmount()}
                                onChange={(e) => setForm('inputAmount', Number(e.target.value))}
                                onKeyUp={(e) => setForm('inputAmount', Number(e.currentTarget.value))}
                                placeholder="Enter amount"
                                classList={{ 'is-valid': isValid('inputAmount'), 'is-invalid': isInvalid('inputAmount') }}
                                disabled={swapType() === 'in'}
                            />
                        </div>
                    </div>
                    <div style="margin: auto -28px; z-index: 0; cursor: pointer;" onClick={flipAssets}>
                        <img src={flipImg} draggable={false} />
                    </div>
                    <div class="bg-light d-flex flex-column p-4" style="flex: 1 1 0" id="right-side">
                        <div class="fw-medium">
                            <AssetSelector selectedAsset={form.to} counterpartyAsset={form.from} onAssetSelect={(asset) => updateAssets(form.from, asset)} />
                        </div>
                        <hr />
                        <div class="fs-6">You get</div>
                        <div>
                            <input
                                class="form-control form-control-lg inline-input"
                                value={outputAmount()}
                                disabled
                                classList={{ 'is-valid': isValid('outputAmount'), 'is-invalid': isInvalid('outputAmount') }}
                            />
                        </div>
                    </div>
                </div>
                <Show when={destinationAsset() === 'LIGHTNING_BITCOIN'}>
                    <Form.Control
                        as="textarea"
                        rows={5}
                        placeholder="Paste a lightning invoice"
                        id="invoice-input"
                        value={form.payload}
                        onChange={(e) => setForm('payload', e.target.value)}
                        onKeyUp={(e) => setForm('payload', e.currentTarget.value)}
                        isValid={isValid('payload')}
                        isInvalid={isInvalid('payload')}
                    />
                </Show>
                <Show when={destinationAsset() === 'ON_CHAIN_BITCOIN'}>
                    <Form.Control
                        type="text"
                        placeholder="Enter bitcoin address"
                        value={form.payload}
                        onChange={(e) => setForm('payload', e.target.value)}
                        onKeyUp={(e) => setForm('payload', e.currentTarget.value)}
                        isValid={isValid('payload')}
                        isInvalid={isInvalid('payload')}
                    />
                </Show>
                <Show when={destinationAsset() === 'ON_CHAIN_LIQUID'}>
                    <Form.Control
                        type="text"
                        placeholder="Enter liquid address"
                        value={form.payload}
                        onChange={(e) => setForm('payload', e.target.value)}
                        onKeyUp={(e) => setForm('payload', e.currentTarget.value)}
                        isValid={isValid('payload')}
                        isInvalid={isInvalid('payload')}
                    />
                </Show>
                <div class="text-muted text-end small">
                    Fee ({config()?.feePercentage}%): {currencyFormat(fee())}
                </div>
                <ActionButton action={createSwap} disabled={!isSendable()}>
                    Create swap
                </ActionButton>
                <div class="text-muted text-center small border border-primary rounded-3 p-2">
                    <Fa icon={faInfoCircle} />
                    Minimum amount {currencyFormat(config()?.minimumAmount ?? 0)}
                    &nbsp; | Maximum amount {currencyFormat(config()?.maximumAmount ?? 0)}
                </div>
                <Show when={errorMessage() !== ''}>
                    <div class="text-muted text-center small border border-danger rounded-3 p-2 bg-danger-subtle" style="border-style: dashed !important">
                        <Fa icon={faInfoCircle} /> {errorMessage()}
                    </div>
                </Show>
            </div>
        </>
    );
};
