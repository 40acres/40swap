import { Injectable } from '@nestjs/common';
import * as client from 'prom-client';
import { Gauge } from 'prom-client';

@Injectable()
export class PrometheusService {
    private readonly registry: client.Registry;

    public readonly channelInfo = new Gauge({
        name: 'info_lnd_channel',
        help: 'Maps lightning channel IDs to the peer aliases',
        labelNames: ['chan_id', 'peer_alias'],
    });

    constructor() {
        this.registry = new client.Registry();
        this.registry.registerMetric(this.channelInfo);
        this.registry.setDefaultLabels({ app: '40swap' });
    }

    getMetrics(): Promise<string> {
        return this.registry.metrics();
    }
}
