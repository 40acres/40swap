import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import fetch from 'node-fetch';
import { FortySwapConfiguration } from './configuration.js';

const recommendedFeesResponseSchema = z.object({
    fastestFee: z.number().positive(),
    halfHourFee: z.number().positive(),
    hourFee: z.number().positive(),
    economyFee: z.number().positive(),
    minimumFee: z.number().positive(),
});
export type RecommendedFeesResponse = z.infer<typeof recommendedFeesResponseSchema>;

@Injectable()
export class MempoolDotSpaceService {
    private readonly logger = new Logger(MempoolDotSpaceService.name);
    private readonly config: FortySwapConfiguration['mempoolBlockExplorer'];

    constructor(config: ConfigService<FortySwapConfiguration>) {
        this.config = config.getOrThrow('mempoolBlockExplorer', { infer: true });
    }

    async getFeeRate(): Promise<RecommendedFeesResponse> {
        if (!this.config.useFeeEstimator) {
            this.logger.log('getFeeRate() is disabled in config');
            throw new Error('service is disabled');
        }

        const response = await fetch(`${this.config.url}/api/v1/fees/recommended`, {
            method: 'GET',
        });
        if (response.status >= 300) {
            throw new Error('mempool.space threw an error when fetching the fee rate');
        }
        return recommendedFeesResponseSchema.parse(await response.json());
    }
}
