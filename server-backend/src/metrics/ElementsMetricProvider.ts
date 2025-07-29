import { Injectable } from '@nestjs/common';
import { Gauge } from 'prom-client';
import { PrometheusService } from './PrometheusService.js';
import { LiquidService } from '../LiquidService.js';

@Injectable()
export class ElementsMetricProvider {
    constructor(metrics: PrometheusService, elements: LiquidService) {
        if (elements.isLiquidEnabled) {
            metrics.registry.registerMetric(
                new Gauge({
                    name: 'elements_wallet_balance',
                    help: 'Elements wallet balance',
                    labelNames: ['asset', 'wallet'],
                    async collect() {
                        const listWalletsResponse = (await elements.callRPC('listwallets')) as string[];
                        for (const wallet of listWalletsResponse) {
                            const getBalanceResponse = (await elements.callRPC('getbalance', [], wallet)) as object;
                            for (const [asset, balance] of Object.entries(getBalanceResponse)) {
                                if (typeof balance === 'number') {
                                    this.labels({ wallet, asset }).set(balance);
                                }
                            }
                        }
                    },
                }),
            );
        }
    }
}
