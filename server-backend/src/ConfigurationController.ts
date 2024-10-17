import { Controller, Get } from '@nestjs/common';
import { FrontendConfigurationServer } from '@40swap/shared';
import { ConfigService } from '@nestjs/config';
import { FourtySwapConfiguration } from './configuration.js';

@Controller('configuration')
export class ConfigurationController {

    constructor(private readonly config: ConfigService<FourtySwapConfiguration>) {}

    @Get()
    public async getConfiguration(): Promise<FrontendConfigurationServer> {
        return {
            bitcoinNetwork: this.config.getOrThrow('bitcoin.network', { infer: true }),
            feePercentage: this.config.getOrThrow('swap.feePercentage', { infer: true }),
        };
    }
}