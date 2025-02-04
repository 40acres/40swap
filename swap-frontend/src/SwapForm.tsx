import { Component, createEffect, createResource, createSignal, Show } from 'solid-js';
import { Form, Dropdown } from 'solid-bootstrap';
import bitcoinLogo from '/assets/bitcoin-logo.svg';
import lightningLogo from '/assets/lightning-logo.svg';
import liquidLogo from '/assets/liquid-logo.svg';
import flipImg from '/assets/flip.png';
import { AssetType, currencyFormat, SwapType } from './utils.js';
import { createStore } from 'solid-js/store';
import { decode } from 'bolt11';
import { applicationContext } from './ApplicationContext.js';
import { useNavigate } from '@solidjs/router';
import Decimal from 'decimal.js';
import { address } from 'bitcoinjs-lib';
import { ActionButton } from './ActionButton.js';
import { toast } from 'solid-toast';
import { getSwapInInputAmount, getSwapOutOutputAmount } from '@40swap/shared';
import Fa from 'solid-fa';
import { faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import { AssetSelector } from './components/AssetSelector';

export type SwappableAsset = {
    asset: AssetType,
    payload: string,
}
type FormData = {
    inputAmount: number,
    from: SwappableAsset,
    to: SwappableAsset,
};

export const SwapForm: Component = () => {
    const { swapInService, swapOutService } = applicationContext;
    const navigate = useNavigate();
    const [swapType, setSwapType] = createSignal<SwapType>('in');

    const [form, setForm] = createStore<FormData>({
        from: { asset: AssetType.LIGHTNING_BITCOIN, payload: '' },
        to: { asset: AssetType.ON_CHAIN_BITCOIN, payload: '' },
        inputAmount: 0,
    });
    const [formErrors, setFormErrors] = createStore<{ [key in keyof FormData]: boolean } & { outputAmount: boolean }>({
        inputAmount: false,
        from: false,
        to: false,
        outputAmount: false,
    });
    const [errorMessage, setErrorMessage] = createSignal('');
    const [config] = createResource(() => applicationContext.config);
    const [validated, setValidated] = createSignal(false);

    function outputAmount(): number {
        if (swapType() === 'in') {
            if (form.from.payload !== '') {
                try {
                    const invoice = decode(form.from.payload);
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

    function flipSwapType(): void {
        setForm({
            from: form.to,
            to: form.from,
            inputAmount: 0,
        });
        setSwapType(swapType() === 'in' ? 'out' : 'in');
    }

    function changeAsset(from: AssetType, to: AssetType): void {
        setForm({
            from: { asset: from, payload: '' },
            to: { asset: to, payload: '' },
            inputAmount: 0,
        });
    }

    function isValid(field: keyof FormData | 'outputAmount'): boolean {
        // if we wanted to show the valid markers, uncomment this line
        return validated() && !formErrors[field];
    }

    function isInvalid(field: keyof FormData | 'outputAmount'): boolean {
        return validated() && formErrors[field];
    }

    async function validate(): Promise<void> {
        const conf = config();
        if (conf == null) {
            return;
        }
        setErrorMessage('');
        if (swapType() === 'in') {
            const isInvalidOutputAmount = outputAmount() < conf.minimumAmount || outputAmount() > conf.maximumAmount;
            setFormErrors('outputAmount', isInvalidOutputAmount);
            if (isInvalidOutputAmount) {
                setErrorMessage('Invalid amount');
            }
            setFormErrors('inputAmount', false);
            try {
                decode(form.from.payload);
                setFormErrors('from', false);
            } catch (e) {
                setFormErrors('from', true);
                setErrorMessage('Invalid invoice');
            }
        } else {
            const isInvalidInputAmount = inputAmount() < conf.minimumAmount || inputAmount() > conf.maximumAmount;
            setFormErrors('inputAmount', isInvalidInputAmount);
            if (isInvalidInputAmount) {
                setErrorMessage('Invalid amount');
            }
            setFormErrors('outputAmount', false);
            try {
                address.toOutputScript(form.from.payload, conf.bitcoinNetwork);
                setFormErrors('from', false);
            } catch (e) {
                setFormErrors('from', true);
                setErrorMessage('Invalid bitcoin address');
            }
        }
        setValidated(true);
    }

    createEffect(() => {
        if (validated()) {
            validate();
        }
    });

    function hasErrors(): boolean {
        return formErrors.from || formErrors.to || formErrors.inputAmount || formErrors.outputAmount;
    }

    function isSendable(): boolean {
        return !hasErrors() && form.from.payload !== '' && form.to.payload !== '';
    }

    async function createSwap(): Promise<void> {
        await validate();
        if (hasErrors()) {
            return;
        }
        try {
            if (swapType() === 'in') {
                const swap = await swapInService.createSwap(form.from.payload);
                navigate(`/swap/in/${swap.swapId}`);
            } else if (swapType() === 'out') {
                const swap = await swapOutService.createSwap(form.from.payload, inputAmount());
                navigate(`/swap/out/${swap.swapId}`);
            }
        } catch (e) {
            toast.error('Unknown error');
        }
    }

    return <>
        <h3 class="fw-bold">Create a Swap</h3>
        <div class="d-flex flex-column gap-3">
            <div class="d-flex gap-2">
                <div class="bg-light d-flex flex-column p-4" style="flex: 1 1 0">
                    <div class="fw-medium">
                        <AssetSelector 
                            selectedAsset={form.from.asset}
                            onAssetSelect={(asset) => changeAsset(asset, form.to.asset)}
                        />
                    </div>
                    <hr />
                    <div class="fs-6">You send</div>
                    <div>
                        <input class="form-control form-control-lg inline-input" step={0.001} max={2} type="number"
                            value={inputAmount()}
                            onChange={e => setForm('inputAmount', Number(e.target.value))}
                            onKeyUp={e => setForm('inputAmount', Number(e.currentTarget.value))}
                            placeholder="Enter amount"
                            classList={{ 'is-valid': isValid('inputAmount'), 'is-invalid': isInvalid('inputAmount') }}
                            disabled={swapType() === 'in'}
                        />
                    </div>
                </div>
                <div style="margin: auto -28px; z-index: 0" onClick={flipSwapType}>
                    <img src={flipImg} draggable={false}/>
                </div>
                <div class="bg-light d-flex flex-column p-4" style="flex: 1 1 0" id="right-side">
                    <div class="fw-medium">
                        <AssetSelector 
                            selectedAsset={form.to.asset}
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
            <Show when={swapType() === 'in'}>
                <Form.Control as="textarea" rows={5} placeholder="Paste a lightning invoice" id="invoice-input"
                    value={form.from.payload}
                    onChange={e => setForm('from', { payload: e.target.value, asset: AssetType.LIGHTNING_BITCOIN })}
                    onKeyUp={e => setForm('from', { payload: e.currentTarget.value, asset: AssetType.LIGHTNING_BITCOIN })}
                    isValid={isValid('from')} isInvalid={isInvalid('from')}
                />
            </Show>
            <Show when={swapType() === 'out'}>
                <Form.Control type="text" placeholder="Enter address"
                    value={form.from.payload}
                    onChange={e => setForm('from', { payload: e.target.value, asset: AssetType.ON_CHAIN_BITCOIN })}
                    onKeyUp={e => setForm('from', { payload: e.currentTarget.value, asset: AssetType.ON_CHAIN_BITCOIN })}
                    isValid={isValid('from')} isInvalid={isInvalid('from')}
                />
            </Show>
            <div class="text-muted text-end small">Fee ({config()?.feePercentage}%): {currencyFormat(fee())}</div>
            <ActionButton action={createSwap} disabled={!isSendable() || hasErrors()}>Create swap</ActionButton>
            <div class="text-muted text-center small border border-primary rounded-3 p-2">
                <Fa icon={faInfoCircle} /> Minimum amount {currencyFormat(config()?.minimumAmount ?? 0)} | Maximum amount {currencyFormat(config()?.maximumAmount ?? 0)}
            </div>
            <Show when={errorMessage() !== ''}>
                <div class="text-muted text-center small border border-danger rounded-3 p-2 bg-danger-subtle" style="border-style: dashed !important">
                    <Fa icon={faInfoCircle} /> {errorMessage()}
                </div>
            </Show>
        </div>
    </>;
};