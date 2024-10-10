import { Component, createEffect, createResource, createSignal, Show } from 'solid-js';
import { Form } from 'solid-bootstrap';
import bitcoinLogo from '/assets/bitcoin-logo.svg';
import lightningLogo from '/assets/lightning-logo.svg';
import swapPlacesImg from '/assets/swap-places.svg';
import { Asset, SwapType } from './utils.js';
import { createStore } from 'solid-js/store';
import { decode } from 'bolt11';
import { applicationContext } from './ApplicationContext.js';
import { useNavigate } from '@solidjs/router';
import Decimal from 'decimal.js';
import { address, networks } from 'bitcoinjs-lib';
import { ActionButton } from './ActionButton.js';
import { toast } from 'solid-toast';

const AssetDetails = {
    'ON_CHAIN_BITCOIN': {
        displayName: 'BTC',
        icon: bitcoinLogo,
    },
    'LIGHTNING_BITCOIN':  {
        displayName: 'Lightning',
        icon: lightningLogo,
    },
};

type FormData = {
    inputAmount: number,
    lightningInvoice: string,
    bitcoinAddress: string,
};

export const SwapForm: Component = () => {
    const { swapInService, swapOutService } = applicationContext;
    const navigate = useNavigate();
    const [swapType, setSwapType] = createSignal<SwapType>('in');
    const [form, setForm] = createStore<FormData>({
        lightningInvoice: '',
        bitcoinAddress: '',
        inputAmount: 0,
    });
    const [formErrors, setFormErrors] = createStore<{ [key in keyof FormData]: boolean }>({
        lightningInvoice: false,
        bitcoinAddress: false,
        inputAmount: false,
    });
    const [bitcoinConfig] = createResource(() => applicationContext.config);
    const [validated, setValidated] = createSignal(false);

    function outputAmount(): number {
        return inputAmount();
    }

    function inputAmount(): number {
        if (swapType() === 'in') {
            if (form.lightningInvoice !== '') {
                try {
                    const invoice = decode(form.lightningInvoice);
                    if (invoice.satoshis != null) {
                        return new Decimal(invoice.satoshis).div(1e8).toDecimalPlaces(8).toNumber();
                    }
                } catch (e) {
                    // empty
                }
            }
            return 0;
        } else {
            return form.inputAmount;
        }
    }

    function flipSwapType(): void {
        if (swapType() === 'in') {
            setSwapType('out');
        } else {
            setSwapType('in');
        }
    }

    function getInputAsset(): Asset {
        if (swapType() === 'out') {
            return 'LIGHTNING_BITCOIN';
        }
        return 'ON_CHAIN_BITCOIN';
    }

    function getOutputAsset(): Asset {
        if (swapType() === 'in') {
            return 'LIGHTNING_BITCOIN';
        }
        return 'ON_CHAIN_BITCOIN';
    }

    function isValid(field: keyof FormData): boolean {
        return validated() && !formErrors[field];
    }

    function isInvalid(field: keyof FormData): boolean {
        return validated() && formErrors[field];
    }

    async function validate(): Promise<void> {
        if(swapType() === 'in') {
            try {
                decode(form.lightningInvoice);
                setFormErrors('lightningInvoice', false);
            } catch (e) {
                setFormErrors('lightningInvoice', true);
            }
        } else {
            try {
                const network = bitcoinConfig()?.bitcoinNetwork ?? networks.bitcoin;
                address.toOutputScript(form.bitcoinAddress, network);
                setFormErrors('bitcoinAddress', false);
            } catch (e) {
                setFormErrors('bitcoinAddress', true);
            }
            setFormErrors('inputAmount', inputAmount() <= 0);
        }
        setValidated(true);
    }

    createEffect(() => {
        if (validated()) {
            validate();
        }
    });

    function hasErrors(): boolean {
        return formErrors.lightningInvoice || formErrors.bitcoinAddress || formErrors.inputAmount;
    }

    function isSendable(): boolean {
        if (swapType() === 'in') {
            return form.lightningInvoice !== '';
        } else {
            return form.bitcoinAddress !== '';
        }
    }

    async function createSwap(): Promise<void> {
        await validate();
        if (hasErrors()) {
            return;
        }
        try {
            if (swapType() === 'in') {
                const swap = await swapInService.createSwap(form.lightningInvoice);
                navigate(`/swap/in/${swap.swapId}`);
            } else if (swapType() === 'out') {
                const swap = await swapOutService.createSwap(form.bitcoinAddress, inputAmount());
                navigate(`/swap/out/${swap.swapId}`);
            }
        } catch (e) {
            toast.error('Unknown error');
        }
    }

    return <>
        <h3 class="fw-bold">Create a Swap</h3>
        <div class="d-flex flex-column gap-2">
            <div class="d-flex gap-2">
                <div class="bg-light d-flex flex-column p-4" style="flex: 1 1 0">
                    <div class="fw-medium">
                        <img src={AssetDetails[getInputAsset()].icon} /><span class="ps-1 text-uppercase">{AssetDetails[getInputAsset()].displayName}</span>
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
                    <img style="height: 48px" src={swapPlacesImg} />
                </div>
                <div class="bg-light d-flex flex-column p-4" style="flex: 1 1 0" id="right-side">
                    <div class="fw-medium">
                        <img src={AssetDetails[getOutputAsset()].icon}/><span class="ps-1 text-uppercase">{AssetDetails[getOutputAsset()].displayName}</span>
                    </div>
                    <hr/>
                    <div class="fs-6">You get</div>
                    <div><input class="form-control form-control-lg inline-input" value={outputAmount()} disabled/></div>
                </div>
            </div>
            <Show when={swapType() === 'in'}>
                <Form.Control as="textarea" rows={5} placeholder="Paste a lightning invoice" id="invoice-input"
                    value={form.lightningInvoice}
                    onChange={e => setForm('lightningInvoice', e.target.value)}
                    onKeyUp={e => setForm('lightningInvoice', e.currentTarget.value)}
                    isValid={isValid('lightningInvoice')} isInvalid={isInvalid('lightningInvoice')}
                />
            </Show>
            <Show when={swapType() === 'out'}>
                <Form.Control type="text" placeholder="Enter bitcoin address"
                    value={form.bitcoinAddress}
                    onChange={e => setForm('bitcoinAddress', e.target.value)}
                    onKeyUp={e => setForm('bitcoinAddress', e.currentTarget.value)}
                    isValid={isValid('bitcoinAddress')} isInvalid={isInvalid('bitcoinAddress')}
                />
            </Show>
            <ActionButton action={createSwap} disabled={!isSendable() || hasErrors()}>Create swap</ActionButton>
        </div>
    </>;
};