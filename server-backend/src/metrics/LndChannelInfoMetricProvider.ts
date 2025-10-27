import { PrometheusService } from './PrometheusService.js';
import { LndService } from '../LndService.js';
import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Gauge } from 'prom-client';

@Injectable()
export class LndChannelInfoMetricProvider implements OnApplicationBootstrap, OnApplicationShutdown {
    private readonly logger = new Logger(LndChannelInfoMetricProvider.name);
    private pollInterval: ReturnType<typeof setInterval> | undefined;

    public readonly channelInfo = new Gauge({
        name: 'info_lnd_channel',
        help: 'Maps lightning channel IDs to the peer aliases',
        labelNames: ['chan_id', 'peer_alias'],
    });

    constructor(
        private readonly metrics: PrometheusService,
        private readonly lnd: LndService,
    ) {
        this.metrics.registry.registerMetric(this.channelInfo);
    }

    async run(): Promise<void> {
        try {
            const channels = await this.lnd.getChannelInfo();
            if (channels != null) {
                for (const c of channels) {
                    // eslint-disable-next-line no-control-regex
                    this.channelInfo.labels({ chan_id: c.chanId, peer_alias: c.peerAlias.replace(/[^\x00-\x7F]/g, '') }).set(1);
                }
            }
        } catch (error) {
            this.logger.warn(`Error getting LND channel info for metric: ${(error as Error).message}`);
        }
    }

    onApplicationBootstrap(): void {
        void this.run();
        this.pollInterval = setInterval(() => this.run(), 5 * 60 * 1000);
    }

    onApplicationShutdown(signal?: string): void {
        clearInterval(this.pollInterval);
    }
}
