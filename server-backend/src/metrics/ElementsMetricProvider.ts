import { Injectable, Logger } from '@nestjs/common';
import { Gauge } from 'prom-client';
import { PrometheusService } from './PrometheusService.js';
import { LiquidService } from '../LiquidService.js';

@Injectable()
export class ElementsMetricProvider {
    constructor(metrics: PrometheusService, elements: LiquidService) {
        const logger = new Logger(ElementsMetricProvider.name);
        if (elements.isLiquidEnabled) {
            metrics.registry.registerMetric(
                new Gauge({
                    name: 'elements_wallet_balance',
                    help: 'Elements wallet balance',
                    labelNames: ['asset', 'wallet'],
                    async collect() {
                        const listWalletsResponse = (await elements.callRPC('listwallets')) as string[];
                        for (const walletName of listWalletsResponse) {
                            try {
                                const getBalanceResponse = (await elements.callRPC('getbalance', [], walletName)) as object;
                                for (const [asset, balance] of Object.entries(getBalanceResponse)) {
                                    if (typeof balance === 'number') {
                                        const wallet = walletName === '' ? '<empty>' : walletName;
                                        this.labels({ wallet, asset }).set(balance);
                                    }
                                }
                            } catch (e) {
                                logger.warn(`Error trying to get liquid balance from wallet "${walletName}": ${(e as Error).message}`);
                            }
                        }
                    },
                }),
            );
        }
    }
}
