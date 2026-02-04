import { Component, createSignal, For, Show } from 'solid-js';
import { createResource } from 'solid-js';
import { ApiService } from '../services/ApiService';
import { Container, Row, Col, Card, Button, Table, Badge, ProgressBar } from 'solid-bootstrap';
import { formatSats, calculateBalancePercentage } from '../utils/formatters';
import { SwapModal } from './SwapModal';
import { ChannelInfo } from '../types/api';
import Decimal from 'decimal.js';

export const ChannelsPage: Component = () => {
    const [channels, { refetch }] = createResource(() => ApiService.getChannels());
    const [selectedChannel, setSelectedChannel] = createSignal<ChannelInfo | null>(null);
    const [showSwapModal, setShowSwapModal] = createSignal(false);

    const handleSwapClick = (channel: ChannelInfo): void => {
        setSelectedChannel(channel);
        setShowSwapModal(true);
    };

    const handleSwapComplete = (): void => {
        setShowSwapModal(false);
        setSelectedChannel(null);
        refetch();
    };

    return (
        <Container class="py-4">
            <Row class="mb-4">
                <Col>
                    <h1>Lightning Channels</h1>
                    <p class="text-muted">Manage liquidity across your Lightning Network channels</p>
                </Col>
                <Col xs="auto">
                    <Button variant="primary" onClick={() => refetch()}>
                        Refresh
                    </Button>
                </Col>
            </Row>

            <Show when={channels.loading}>
                <div class="text-center py-5">
                    <div class="spinner-border" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                </div>
            </Show>

            <Show when={channels.error}>
                <div class="alert alert-danger">Error loading channels: {channels.error?.toString()}</div>
            </Show>

            <Show when={channels()}>
                <Card>
                    <Card.Body class="p-0">
                        <Table responsive hover class="mb-0">
                            <thead>
                                <tr>
                                    <th>Peer</th>
                                    <th>Channel ID</th>
                                    <th>Status</th>
                                    <th>Capacity (BTC)</th>
                                    <th>Local Balance (BTC)</th>
                                    <th>Remote Balance (BTC)</th>
                                    <th>Balance</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                <For each={channels()}>
                                    {(channel) => {
                                        const balancePercent = (): number => calculateBalancePercentage(channel.localBalance, channel.capacity);
                                        return (
                                            <tr>
                                                <td>
                                                    <strong>{channel.peerAlias}</strong>
                                                    {channel.peerAlias !== channel.remotePubkey && (
                                                        <div>
                                                            <small class="text-muted">{channel.remotePubkey.substring(0, 16)}...</small>
                                                        </div>
                                                    )}
                                                </td>
                                                <td>
                                                    <code>{channel.channelId}</code>
                                                </td>
                                                <td>
                                                    <Badge bg={channel.active ? 'success' : 'secondary'}>{channel.active ? 'Active' : 'Inactive'}</Badge>
                                                </td>
                                                <td>{new Decimal(channel.capacity).div(1e8).toFixed(8)}</td>
                                                <td>{new Decimal(channel.localBalance).div(1e8).toFixed(8)}</td>
                                                <td>{new Decimal(channel.remoteBalance).div(1e8).toFixed(8)}</td>
                                                <td>
                                                    <ProgressBar now={balancePercent()} label={`${balancePercent().toFixed(1)}%`} variant="info" />
                                                </td>
                                                <td>
                                                    <Button
                                                        size="sm"
                                                        variant="outline-primary"
                                                        onClick={() => handleSwapClick(channel)}
                                                        disabled={!channel.active}
                                                    >
                                                        Swap Out
                                                    </Button>
                                                </td>
                                            </tr>
                                        );
                                    }}
                                </For>
                            </tbody>
                        </Table>
                    </Card.Body>
                </Card>
            </Show>

            <Show when={selectedChannel()}>
                <SwapModal show={showSwapModal()} channel={selectedChannel()!} onClose={() => setShowSwapModal(false)} onComplete={handleSwapComplete} />
            </Show>
        </Container>
    );
};
