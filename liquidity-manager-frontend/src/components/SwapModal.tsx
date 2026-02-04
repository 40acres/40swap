import { Component, createSignal, Show, createResource, For } from 'solid-js';
import { Modal, Button, Form } from 'solid-bootstrap';
import { ApiService } from '../services/ApiService';
import { ChannelInfo, SwapRequest } from '../types/api';
import { formatSats } from '../utils/formatters';
import toast from 'solid-toast';
import Decimal from 'decimal.js';

interface SwapModalProps {
    show: boolean;
    channel: ChannelInfo;
    onClose: () => void;
    onComplete: () => void;
}

export const SwapModal: Component<SwapModalProps> = (props) => {
    const [amount, setAmount] = createSignal('');
    const [strategy, setStrategy] = createSignal('dummy');
    const [loading, setLoading] = createSignal(false);

    const [strategies] = createResource(async () => {
        try {
            return await ApiService.getStrategies();
        } catch (error) {
            console.error('Failed to load strategies:', error);
            return ['dummy', 'bitfinex']; // Fallback
        }
    });

    const maxAmount = (): number => parseInt(props.channel.localBalance, 10);

    const handleSubmit = async (e: Event): Promise<void> => {
        e.preventDefault();
        const parsedAmount = parseFloat(amount());

        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            toast.error('Please enter a valid amount');
            return;
        }

        if (parsedAmount > maxAmount()) {
            toast.error(`Amount exceeds maximum available balance of ${formatSats(maxAmount())} sats`);
            return;
        }

        setLoading(true);
        try {
            const request: SwapRequest = {
                channelId: props.channel.channelId,
                amount: amount(),
                strategy: strategy(),
            };
            const result = await ApiService.initiateSwap(request);
            toast.success(`Swap initiated! ID: ${result.swapId}. Check History tab for status updates.`);
            props.onComplete();
        } catch (error) {
            toast.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setLoading(false);
        }
    };

    const handleClose = (): void => {
        if (!loading()) {
            setAmount('');
            setStrategy('dummy');
            props.onClose();
        }
    };

    return (
        <Modal show={props.show} onHide={handleClose}>
            <Modal.Header closeButton>
                <Modal.Title>Swap Out Balance</Modal.Title>
            </Modal.Header>
            <Form onSubmit={handleSubmit}>
                <Modal.Body>
                    <div class="mb-3">
                        <strong>Peer:</strong> {props.channel.peerAlias}
                    </div>
                    <div class="mb-3">
                        <strong>Channel ID:</strong> <code>{props.channel.channelId}</code>
                    </div>
                    <div class="mb-3">
                        <strong>Available Balance:</strong> {new Decimal(props.channel.localBalance).div(1e8).toFixed(8)} BTC
                    </div>
                    <Form.Group class="mb-3">
                        <Form.Label>Strategy</Form.Label>
                        <Form.Select value={strategy()} onChange={(e) => setStrategy(e.currentTarget.value)} disabled={loading()}>
                            <For each={strategies()}>
                                {(strat) => (
                                    <option value={strat}>
                                        {strat === 'dummy' ? 'Dummy (Test - No funds moved)' : strat.charAt(0).toUpperCase() + strat.slice(1)}
                                    </option>
                                )}
                            </For>
                        </Form.Select>
                        <Form.Text class="text-muted">Swap method to use</Form.Text>
                    </Form.Group>
                    <Form.Group class="mb-3">
                        <Form.Label>Amount (BTC)</Form.Label>
                        <Form.Control
                            type="number"
                            placeholder="Enter amount"
                            value={amount()}
                            onInput={(e) => setAmount(e.currentTarget.value)}
                            min="1"
                            max={maxAmount()}
                            disabled={loading()}
                            required
                        />
                        <Form.Text class="text-muted">Maximum: {new Decimal(maxAmount()).div(1e8).toFixed(8)} BTC</Form.Text>
                    </Form.Group>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={handleClose} disabled={loading()}>
                        Cancel
                    </Button>
                    <Button variant="primary" type="submit" disabled={loading()}>
                        <Show when={loading()} fallback="Initiate Swap">
                            <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                            Initiating...
                        </Show>
                    </Button>
                </Modal.Footer>
            </Form>
        </Modal>
    );
};
