import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Gauge } from 'prom-client';
import { PrometheusService } from './PrometheusService.js';
import { LiquidService } from '../LiquidService.js';

@Injectable()
export class ElementsMetricProvider implements OnApplicationBootstrap, OnApplicationShutdown {
    private pollInterval: ReturnType<typeof setInterval> | undefined;

    public readonly channelInfo = new Gauge({
        name: 'elements_wallet_balance',
        help: 'Elements wallet balance',
        labelNames: ['asset', 'wallet'],
    });

    constructor(
        private readonly metrics: PrometheusService,
        private readonly elements: LiquidService,
    ) {
        this.metrics.registry.registerMetric(this.channelInfo);
    }

    async run(): Promise<void> {
        const listWalletsResponse = (await this.elements.callRPC('listwallets')) as string[];
        for (const wallet of listWalletsResponse) {
            const getBalanceResponse = (await this.elements.callRPC('getbalance', [], wallet)) as object;
            for (const [asset, balance] of Object.entries(getBalanceResponse)) {
                if (typeof balance === 'number') {
                    this.channelInfo.labels({ wallet, asset }).set(balance);
                }
            }
        }
    }

    onApplicationBootstrap(): void {
        if (this.elements.isLiquidEnabled) {
            void this.run();
            this.pollInterval = setInterval(() => this.run(), 5 * 60 * 1000);
        }
    }

    onApplicationShutdown(signal?: string): void {
        clearInterval(this.pollInterval);
    }
}
