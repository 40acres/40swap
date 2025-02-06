import Fa from 'solid-fa';
import Decimal from 'decimal.js';
import flipImg from '/assets/flip.png';
import { Component, createEffect, createResource, createSignal, Show } from 'solid-js';
import { FrontendConfiguration, getSwapInInputAmount, getSwapOutOutputAmount } from '@40swap/shared';
import { AssetType, currencyFormat, SwapType } from './utils.js';
import { faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import { applicationContext } from './ApplicationContext.js';
import { AssetSelector } from './components/AssetSelector';
import { ActionButton } from './ActionButton.js';
import { fromBase58Check } from 'liquidjs-lib/src/address.js';
import { useNavigate } from '@solidjs/router';
import { createStore } from 'solid-js/store';
import { address } from 'bitcoinjs-lib';
import { Form } from 'solid-bootstrap';
import { toast } from 'solid-toast';
import { decode } from 'bolt11';

export type SwappableAsset = {
    asset: AssetType
}

type FormData = {
    inputAmount: number,
    from: SwappableAsset,
    to: SwappableAsset,
    payload: string,
};

export const SwapForm: Component = () => {
    const { swapInService, swapOutService } = applicationContext;
    const navigate = useNavigate();
    const [config] = createResource(() => applicationContext.config);
    const [destinationAsset, setDestinationAsset] = createSignal<AssetType>(AssetType.ON_CHAIN_BITCOIN);
    const [swapType, setSwapType] = createSignal<SwapType>('in');
    const [errorMessage, setErrorMessage] = createSignal('');
    const [validated, setValidated] = createSignal(false);

    const [form, setForm] = createStore<FormData>({
        from: { asset: AssetType.LIGHTNING_BITCOIN},
        to: { asset: AssetType.ON_CHAIN_BITCOIN},
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
        } else if (swapType() === 'out') {
            const conf = config();
            if (conf == null) {
                return 0;
            }
            return getSwapOutOutputAmount(new Decimal(inputAmount()), new Decimal(conf.feePercentage)).toNumber();
        } else {
            // TODO
            return 0;
        }
    }

    function inputAmount(): number {
        if (swapType() === 'in') {
            const conf = config();
            if (conf == null) {
                return 0;
            }
            return getSwapInInputAmount(new Decimal(outputAmount()), new Decimal(conf.feePercentage)).toNumber();
        } else if (swapType() === 'out') {
            return form.inputAmount;
        } else {
            // TODO
            return 0;
        }
    }

    function fee(): number {
        return new Decimal(inputAmount()).minus(outputAmount()).toDecimalPlaces(8).toNumber();
    }

    function flipSwapType(): void {
        setForm({
            from: form.to,
            to: form.from,
            inputAmount: 0,
        });
    }

    function changeAsset(from: AssetType, to: AssetType): void {
        setForm({
            from: { asset: from},
            to: { asset: to},
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
        setFormErrors('inputAmount', false);
    }

    function validateOutputAmount(conf: FrontendConfiguration): void {
        const isInvalidOutputAmount = outputAmount() < conf.minimumAmount || outputAmount() > conf.maximumAmount;
        setFormErrors('outputAmount', isInvalidOutputAmount);
        if (isInvalidOutputAmount) {
            setErrorMessage('Invalid amount');
        }
        setFormErrors('outputAmount', false);
    }

    function validateBitcoinAddress(address: string): void {
        try {
            decode(address);
            setFormErrors('from', false);
        } catch (e) {
            setFormErrors('from', true);
            setErrorMessage('Invalid invoice');
        }
    }

    function validateLightningInvoice(invoice: string, conf: FrontendConfiguration): void {
        try {
            address.toOutputScript(form.payload, conf.bitcoinNetwork);
            setFormErrors('from', false);
        } catch (e) {
            setFormErrors('from', true);
            setErrorMessage('Invalid bitcoin address');
        }
    }

    function validateLiquidAddress(address: string): void {
        try {
            fromBase58Check(address);
            setFormErrors('from', false);
        } catch (e) {
            setFormErrors('from', true);
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
            validateBitcoinAddress(form.payload);
        } else if (swapType() === 'out') {
            validateOutputAmount(conf);
            validateLightningInvoice(form.payload, conf);
        } else if (swapType() === 'chain') {
            switch (form.to.asset) {
            case AssetType.ON_CHAIN_BITCOIN:
                validateBitcoinAddress(form.payload);
                validateInputAmount(conf);
                break;
            case AssetType.LIGHTNING_BITCOIN:
                validateLightningInvoice(form.payload, conf);
                validateOutputAmount(conf);
                break;
            case AssetType.ON_CHAIN_LIQUID:
                validateLiquidAddress(form.payload);
                // TODO
                break;
            }
        }
        setValidated(true);
    }

    function hasErrors(): boolean {
        return formErrors.from || formErrors.to || formErrors.inputAmount || formErrors.outputAmount;
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
            let swap;
            switch (swapType()) {
            case 'in':
                swap = await swapInService.createSwap(form.payload);
                navigate(`/swap/in/${swap.swapId}`);
                break;
            case 'out':
                swap = await swapOutService.createSwap(form.payload, inputAmount());
                navigate(`/swap/out/${swap.swapId}`);
                break;
            default:
                // TODO
                break;
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
        const fromAsset = form.from.asset;
        const toAsset = form.to.asset;
        if (fromAsset === AssetType.LIGHTNING_BITCOIN && toAsset === AssetType.ON_CHAIN_BITCOIN) {
            setSwapType('in');
        } else if (fromAsset === AssetType.ON_CHAIN_BITCOIN && toAsset === AssetType.LIGHTNING_BITCOIN) {
            setSwapType('out');
        } else {
            setSwapType('chain');
        }
    }, [form.from.asset, form.to.asset]);

    createEffect(() => {
        const toAsset = form.to.asset;
        setDestinationAsset(toAsset);
    }, [form.to.asset]);

    return <>
        <h3 class="fw-bold">Create a Swap</h3>
        <p>{swapType()}</p>
        <div class="d-flex flex-column gap-3">
            <div class="d-flex gap-2">
                <div class="bg-light d-flex flex-column p-4" style="flex: 1 1 0">
                    <div class="fw-medium">
                        <AssetSelector 
                            selectedAsset={form.from.asset}
                            excludeAssets={[form.to.asset, form.from.asset]}
                            onAssetSelect={(asset) => changeAsset(asset, form.to.asset)}
                        />
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
                            onChange={e => setForm('inputAmount', Number(e.target.value))}
                            onKeyUp={e => setForm('inputAmount', Number(e.currentTarget.value))}
                            placeholder="Enter amount"
                            classList={{ 'is-valid': isValid('inputAmount'), 'is-invalid': isInvalid('inputAmount') }}
                            disabled={swapType() === 'in'}
                        />
                    </div>
                </div>
                <div style="margin: auto -28px; z-index: 0; cursor: pointer;" onClick={flipSwapType}>
                    <img src={flipImg} draggable={false}/>
                </div>
                <div class="bg-light d-flex flex-column p-4" style="flex: 1 1 0" id="right-side">
                    <div class="fw-medium">
                        <AssetSelector 
                            selectedAsset={form.to.asset}
                            excludeAssets={[form.from.asset, form.to.asset]}
                            onAssetSelect={(asset) => changeAsset(form.from.asset, asset)}
                        />
                    </div>
                    <hr />
                    <div class="fs-6">You get</div>
                    <div>
                        <input class="form-control form-control-lg inline-input" value={outputAmount()} disabled
                            classList={{ 'is-valid': isValid('outputAmount'), 'is-invalid': isInvalid('outputAmount') }}
                        />
                    </div>
                </div>
            </div>
            <Show when={destinationAsset() === AssetType.LIGHTNING_BITCOIN}>
                <Form.Control 
                    as="textarea" 
                    rows={5} 
                    placeholder="Paste a lightning invoice" id="invoice-input"
                    value={form.payload}
                    onChange={e => setForm('payload', e.target.value)}
                    onKeyUp={e => setForm('payload', e.currentTarget.value)}
                    isValid={isValid('payload')} isInvalid={isInvalid('payload')}
                />
            </Show>
            <Show when={destinationAsset() === AssetType.ON_CHAIN_BITCOIN}>
                <Form.Control 
                    type="text" 
                    placeholder="Enter address"
                    value={form.payload}
                    onChange={e => setForm('payload', e.target.value)}
                    onKeyUp={e => setForm('payload', e.currentTarget.value)}
                    isValid={isValid('payload')} isInvalid={isInvalid('payload')}
                />
            </Show>
            <Show when={destinationAsset() === AssetType.ON_CHAIN_LIQUID}>
                <Form.Control 
                    type="text" 
                    placeholder="Enter liquid address"
                    value={form.payload}
                    onChange={e => setForm('payload', e.target.value)}
                    onKeyUp={e => setForm('payload', e.currentTarget.value)}
                    isValid={isValid('payload')} isInvalid={isInvalid('payload')}
                />
            </Show>
            <div class="text-muted text-end small">Fee ({config()?.feePercentage}%): {currencyFormat(fee())}</div>
            <ActionButton action={createSwap} disabled={!isSendable() || hasErrors()}>Create swap</ActionButton>
            <div class="text-muted text-center small border border-primary rounded-3 p-2">
                <Fa icon={faInfoCircle} /> 
                Minimum amount {currencyFormat(config()?.minimumAmount ?? 0)}
                &nbsp; | Maximum amount {currencyFormat(config()?.maximumAmount ?? 0)}
            </div>
            <Show when={errorMessage() !== ''}>
                <div 
                    class="text-muted text-center small border border-danger rounded-3 p-2 bg-danger-subtle" 
                    style="border-style: dashed !important"
                >
                    <Fa icon={faInfoCircle} /> {errorMessage()}
                </div>
            </Show>
        </div>
    </>;
};