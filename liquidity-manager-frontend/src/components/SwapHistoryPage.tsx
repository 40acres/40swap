import { Component, createResource, For, JSX, Show } from 'solid-js';
import { ApiService } from '../services/ApiService';
import { Container, Row, Col, Card, Button, Table, Badge } from 'solid-bootstrap';
import { SwapHistory } from '../types/api';

export const SwapHistoryPage: Component = () => {
    const [swapHistory, { refetch }] = createResource(() => ApiService.getSwapHistory());

    const getStatusBadge = (status: string): string => {
        switch (status) {
            case 'completed':
                return 'success';
            case 'failed':
                return 'danger';
            case 'pending':
                return 'warning';
            default:
                return 'secondary';
        }
    };

    const getOutcomeBadge = (outcome: string | null): string => {
        switch (outcome) {
            case 'success':
                return 'success';
            case 'failed':
                return 'danger';
            case 'timeout':
                return 'warning';
            default:
                return 'secondary';
        }
    };

    const formatDate = (dateString: string): string => {
        const date = new Date(dateString);
        return date.toLocaleString();
    };

    const calculateDuration = (swap: SwapHistory): string => {
        if (!swap.completedAt) return '-';
        const start = new Date(swap.createdAt);
        const end = new Date(swap.completedAt);
        const durationMs = end.getTime() - start.getTime();
        const durationMin = Math.floor(durationMs / 60000);
        const durationSec = Math.floor((durationMs % 60000) / 1000);
        return `${durationMin}m ${durationSec}s`;
    };

    return (
        <Container class="py-4">
            <Row class="mb-4">
                <Col>
                    <h1>Swap History</h1>
                    <p class="text-muted">View all past liquidity swap operations</p>
                </Col>
                <Col xs="auto">
                    <Button variant="primary" onClick={() => refetch()}>
                        Refresh
                    </Button>
                </Col>
            </Row>

            <Show when={swapHistory.loading}>
                <div class="text-center py-5">
                    <div class="spinner-border" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                </div>
            </Show>

            <Show when={swapHistory.error}>
                <div class="alert alert-danger">Error loading swap history: {swapHistory.error?.toString()}</div>
            </Show>

            <Show when={swapHistory()}>
                <Show when={swapHistory()!.length === 0} fallback={<SwapHistoryTable swaps={swapHistory()!} />}>
                    <Card>
                        <Card.Body class="text-center py-5">
                            <p class="text-muted mb-0">No swap history yet. Execute a swap to see it here.</p>
                        </Card.Body>
                    </Card>
                </Show>
            </Show>
        </Container>
    );

    function SwapHistoryTable(props: { swaps: SwapHistory[] }): JSX.Element {
        return (
            <Card>
                <Card.Body class="p-0">
                    <Table responsive hover class="mb-0">
                        <thead>
                            <tr>
                                <th>Swap ID</th>
                                <th>Strategy</th>
                                <th>Date</th>
                                <th>Peer</th>
                                <th>Channel ID</th>
                                <th>Amount (BTC)</th>
                                <th>Cost (BTC)</th>
                                <th>Status</th>
                                <th>Outcome</th>
                                <th>Duration</th>
                                <th>Address</th>
                            </tr>
                        </thead>
                        <tbody>
                            <For each={props.swaps}>
                                {(swap) => (
                                    <tr>
                                        <td>
                                            <code class="small" style="word-break: break-all;">
                                                {swap.id}
                                            </code>
                                        </td>
                                        <td>
                                            <Badge bg={swap.strategy === 'dummy' ? 'secondary' : 'info'} class="text-capitalize">
                                                {swap.strategy}
                                            </Badge>
                                        </td>
                                        <td>
                                            <small>{formatDate(swap.createdAt)}</small>
                                        </td>
                                        <td>
                                            <strong>{swap.peerAlias}</strong>
                                        </td>
                                        <td>
                                            <code class="small">{swap.channelId}</code>
                                        </td>
                                        <td>{swap.amount}</td>
                                        <td>
                                            <Show when={swap.cost} fallback={<span class="text-muted">-</span>}>
                                                {swap.cost}
                                            </Show>
                                        </td>
                                        <td>
                                            <Badge bg={getStatusBadge(swap.status)}>{swap.status}</Badge>
                                        </td>
                                        <td>
                                            <Show when={swap.outcome} fallback={<span class="text-muted">-</span>}>
                                                <Badge bg={getOutcomeBadge(swap.outcome)}>{swap.outcome}</Badge>
                                            </Show>
                                        </td>
                                        <td>
                                            <small>{calculateDuration(swap)}</small>
                                        </td>
                                        <td>
                                            <Show when={swap.address} fallback={<span class="text-muted">-</span>}>
                                                <code class="small">{swap.address!.substring(0, 16)}...</code>
                                            </Show>
                                        </td>
                                    </tr>
                                )}
                            </For>
                        </tbody>
                    </Table>
                </Card.Body>
            </Card>
        );
    }
};
