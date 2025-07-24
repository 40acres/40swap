import { Injectable } from '@nestjs/common';
import * as client from 'prom-client';

@Injectable()
export class PrometheusService {
    public readonly registry: client.Registry;

    constructor() {
        this.registry = new client.Registry();
        this.registry.setDefaultLabels({ app: '40swap' });
    }

    getMetrics(): Promise<string> {
        return this.registry.metrics();
    }
}
