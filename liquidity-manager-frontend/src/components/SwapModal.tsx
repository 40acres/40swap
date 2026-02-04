import { Component, createSignal, Show } from 'solid-js';
import { Modal, Button, Form } from 'solid-bootstrap';
import { ApiService } from '../services/ApiService';
import { ChannelInfo, SwapRequest } from '../types/api';
import { formatSats } from '../utils/formatters';
import toast from 'solid-toast';

interface SwapModalProps {
    show: boolean;
    channel: ChannelInfo;
    onClose: () => void;
    onComplete: () => void;
}

export const SwapModal: Component<SwapModalProps> = (props) => {
    const [amount, setAmount] = createSignal('');
    const [loading, setLoading] = createSignal(false);

    const maxAmount = (): number => parseInt(props.channel.localBalance, 10);

    const handleSubmit = async (e: Event): Promise<void> => {
        e.preventDefault();
        const amountSats = parseInt(amount(), 10);

        if (isNaN(amountSats) || amountSats <= 0) {
            toast.error('Please enter a valid amount');
            return;
        }

        if (amountSats > maxAmount()) {
            toast.error(`Amount exceeds maximum available balance of ${formatSats(maxAmount())} sats`);
            return;
        }

        setLoading(true);
        try {
            const request: SwapRequest = {
                channelId: props.channel.channelId,
                amountSats,
            };
            const result = await ApiService.executeSwap(request);
            if (result.success) {
                toast.success('Swap completed successfully!');
                props.onComplete();
            } else {
                toast.error(`Swap failed: ${result.error}`);
            }
        } catch (error) {
            toast.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setLoading(false);
        }
    };

    const handleClose = (): void => {
        if (!loading()) {
            setAmount('');
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
                        <strong>Channel ID:</strong> <code>{props.channel.channelId}</code>
                    </div>
                    <div class="mb-3">
                        <strong>Available Balance:</strong> {formatSats(props.channel.localBalance)} sats
                    </div>
                    <Form.Group class="mb-3">
                        <Form.Label>Amount (sats)</Form.Label>
                        <Form.Control
                            type="number"
                            placeholder="Enter amount in satoshis"
                            value={amount()}
                            onInput={(e) => setAmount(e.currentTarget.value)}
                            min="1"
                            max={maxAmount()}
                            disabled={loading()}
                            required
                        />
                        <Form.Text class="text-muted">Maximum: {formatSats(maxAmount())} sats</Form.Text>
                    </Form.Group>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={handleClose} disabled={loading()}>
                        Cancel
                    </Button>
                    <Button variant="primary" type="submit" disabled={loading()}>
                        <Show when={loading()} fallback="Execute Swap">
                            <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                            Processing...
                        </Show>
                    </Button>
                </Modal.Footer>
            </Form>
        </Modal>
    );
};
