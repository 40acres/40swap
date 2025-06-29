import { Controller, Get } from '@nestjs/common';
import { FrontendConfigurationServer } from '@40swap/shared';
import { ConfigService } from '@nestjs/config';
import { FortySwapConfiguration } from './configuration.js';
import { ApiExcludeController } from '@nestjs/swagger';

@ApiExcludeController()
@Controller('configuration')
export class ConfigurationController {
    constructor(private readonly config: ConfigService<FortySwapConfiguration>) {}

    @Get()
    public async getConfiguration(): Promise<FrontendConfigurationServer> {
        const elementsConfig = this.config.get('elements');

        return {
            bitcoinNetwork: this.config.getOrThrow('bitcoin.network', { infer: true }),
            feePercentage: this.config.getOrThrow('swap.feePercentage', { infer: true }),
            minimumAmount: this.config.getOrThrow('swap.minimumAmount', { infer: true }),
            maximumAmount: this.config.getOrThrow('swap.maximumAmount', { infer: true }),
            mempoolDotSpaceUrl: this.config.getOrThrow('mempoolBlockExplorer.url', { infer: true }),
            esploraUrl: elementsConfig?.esploraUrl || '',
        };
    }
}
