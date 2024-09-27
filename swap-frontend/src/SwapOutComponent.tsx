import { Component, createEffect, createResource, createSignal, Match, Show, Switch } from 'solid-js';
import { Alert, Button, Form } from 'solid-bootstrap';
import { ClaimSwapOutRequest, GetSwapOutResponse, getSwapOutResponseSchema, SwapOutRequest } from '@40swap/shared';
import { ECPairFactory, ECPairInterface } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import { address, payments, Psbt, script, Transaction } from 'bitcoinjs-lib';
import { witnessStackToScriptWitness } from 'bitcoinjs-lib/src/psbt/psbtutils.js';
import Decimal from 'decimal.js';
import { applicationContext } from './ApplicationContext.js';

const ECPair = ECPairFactory(ecc);

export const SwapOutComponent: Component = () => {
    const [amount, setAmount] = createSignal<number>();
    const [sweepAddress, setSweepAddress] = createSignal('');
    const [currentSwapId, setCurrentSwapId] = createSignal<string>();
    const [currentSwap, { refetch }] = createResource(currentSwapId, id => getSwap(id));
    const [localSwapDetails, setLocalSwapDetails] = createSignal<{ preImage: Buffer, hash: Buffer, claimKey: ECPairInterface}>();
    let claimed = false;


    async function startSwap(): Promise<void> {
        const randomBytes = crypto.getRandomValues(new Uint8Array(32));
        const preImage = Buffer.from(randomBytes);
        const localSwapDetails = {
            preImage,
            hash: await sha256(preImage),
            claimKey: ECPair.makeRandom(),
        };
        setLocalSwapDetails(localSwapDetails);

        const resp = await fetch('/api/swap/out', {
            method: 'POST',
            body: JSON.stringify({
                inputAmount: new Decimal(amount()!).div(1e8).toDecimalPlaces(8).toNumber(),
                claimPubKey: localSwapDetails.claimKey.publicKey.toString('hex'),
                preImageHash: localSwapDetails.hash.toString('hex'),
            } satisfies SwapOutRequest),
            headers: {
                'content-type': 'application/json',
            },
        });
        if (resp.status >= 300) {
            alert(`Unknown error creating the job. ${JSON.stringify(await resp.json())}`);
            return;
        }
        const response = getSwapOutResponseSchema.parse(await resp.json());
        setCurrentSwapId(response.swapId);
    }

    async function sha256(message: Buffer): Promise<Buffer> {
        return Buffer.from(await crypto.subtle.digest('SHA-256', message));
    }


    createEffect(() => {
        if (currentSwapId() != null) {
            setInterval(refetch, 1000);
        }
    });

    createEffect(async () => {
        const swap = currentSwap();
        const localDetails = localSwapDetails();
        if (swap == null || localDetails == null || claimed) {
            return;
        }
        if (swap.status === 'CONTRACT_FUNDED') {
            if (swap.lockTx == null) {
                return;
            }
            const claimTx = await createClaimTransaction({
                claimKey: localDetails.claimKey,
                preImage: localDetails.preImage,
                contractAddress: swap.contractAddress,
                lockScript: Buffer.from(swap.redeemScript, 'hex'),
                lockTx: Transaction.fromHex(swap.lockTx),
                sweepAddress: sweepAddress(),
            });
            const resp = await fetch(`/api/swap/out/${swap.swapId}/claim`, {
                method: 'POST',
                body: JSON.stringify({
                    claimTx: claimTx.toHex(),
                } satisfies ClaimSwapOutRequest),
                headers: {
                    'content-type': 'application/json',
                },
            });
            claimed = true;
            if (resp.status >= 300) {
                alert(`error claiming: ${resp.text()}`);
            }
        }
    });

    async function getSwap(id: string): Promise<GetSwapOutResponse> {
        const resp = await fetch(`/api/swap/out/${id}`);
        return getSwapOutResponseSchema.parse(await resp.json());
    }

    async function createClaimTransaction(args: {
        contractAddress: string,
        lockTx: Transaction,
        sweepAddress: string,
        lockScript: Buffer,
        claimKey: ECPairInterface,
        preImage: Buffer,
    }): Promise<Transaction> {
        const network = (await applicationContext.config).bitcoinNetwork;

        const spendingOutput = args.lockTx.outs
            .map((value, index) => ({ ...value, index }))
            .find(o => {
                try {
                    return address.fromOutputScript(o.script, network) === args.contractAddress;
                } catch (e) {
                    return false;
                }
            });
        if(spendingOutput == null) {
            throw new Error();
        }

        const psbt = new Psbt({ network });
        psbt.addOutput({
            address: args.sweepAddress,
            value: spendingOutput.value - 200, // TODO calculate fee
        });

        const p2wsh = payments.p2wsh({ redeem: { output: args.lockScript, network }, network });
        psbt.addInput({
            hash: args.lockTx.getHash(),
            index: spendingOutput.index,
            witnessScript: args.lockScript,
            witnessUtxo: {
                script: p2wsh.output!,
                value: spendingOutput.value,
            },
        });
        psbt.signInput(0, args.claimKey, [Transaction.SIGHASH_ALL]);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        psbt.finalizeInput(0, (inputIndex, input, arg2, isSegwit, isP2SH, isP2WSH): {
            finalScriptSig: Buffer | undefined;
            finalScriptWitness: Buffer | undefined;
        } => {
            if(input.partialSig == null) {
                throw new Error();
            }
            const redeemPayment = payments.p2wsh({
                redeem: {
                    input: script.compile([
                        input.partialSig[0].signature,
                        args.preImage,
                    ]),
                    output: input.witnessScript,
                },
            });

            const finalScriptWitness = witnessStackToScriptWitness(
                redeemPayment.witness ?? []
            );

            return {
                finalScriptSig: Buffer.from(''),
                finalScriptWitness,
            };
        });
        return psbt.extractTransaction();
    }

    return <>
        <Show when={currentSwap() == null}>
            <Form.Group class="mb-3">
                <Form.Label>Amount (sats):</Form.Label>
                <Form.Control type="number"
                    step={1} min={1}
                    onInput={e => setAmount(Number(e.target.value))}
                />
            </Form.Group>
            <Form.Group class="mb-3">
                <Form.Label>Address to receive funds:</Form.Label>
                <Form.Control type="text"
                    onInput={e => setSweepAddress(e.target.value)}
                />
            </Form.Group>
            <Button onClick={startSwap} disabled={amount() == null}>Start</Button>
        </Show>
        <Show when={currentSwap()}>{s => <>
            <div>Swap id: {s().swapId}</div>
            <Switch>
                <Match when={s().status === 'CREATED'}>
                    <div>
                        Pay the following invoice:
                        <Alert variant={'light'}>
                            <pre style="white-space: pre-wrap; word-wrap: break-word;">{s().invoice}</pre>
                        </Alert>
                    </div>
                </Match>
                <Match when={s().status === 'INVOICE_PAYMENT_INTENT_RECEIVED'}>
                    <div>Sending the money on-chain</div>
                </Match>
                <Match when={s().status === 'CONTRACT_FUNDED'}>
                    <div>Claiming swap to your receiving address</div>
                </Match>
                <Match when={s().status === 'CLAIMED'}>
                    <Alert variant="success">Success</Alert>
                </Match>
            </Switch>
        </>}</Show>
    </>;
};