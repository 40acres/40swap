import { PrometheusService } from './PrometheusService.js';
import { LndService } from '../LndService.js';
import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';

@Injectable()
export class LndChannelInfoMetricProvider implements OnApplicationBootstrap, OnApplicationShutdown {
    private pollInterval: ReturnType<typeof setInterval> | undefined;

    constructor(
        private readonly metrics: PrometheusService,
        private readonly lnd: LndService,
    ) {}

    async run(): Promise<void> {
        const channels = await this.lnd.getChannelInfo();
        if (channels != null) {
            for (const c of channels) {
                // eslint-disable-next-line no-control-regex
                this.metrics.channelInfo.labels({ chan_id: c.chanId, peer_alias: c.peerAlias.replace(/[^\x00-\x7F]/g, '') }).set(1);
            }
        }
    }

    onApplicationBootstrap(): void {
        void this.run();
        this.pollInterval = setInterval(() => this.run, 5 * 60 * 1000);
    }

    onApplicationShutdown(signal?: string): void {
        clearInterval(this.pollInterval);
    }
}
