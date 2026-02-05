import { Module } from '@nestjs/common';
import { SwapInController } from './SwapInController.js';
import { ConfigModule, ConfigService } from '@nestjs/config';
import configuration, { FortySwapConfiguration } from './configuration.js';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { NbxplorerService } from './NbxplorerService.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { SwapOutController } from './SwapOutController.js';
import { BitcoinConfigurationDetails, BitcoinService } from './BitcoinService.js';
import { ConfigurationController } from './ConfigurationController.js';
import { MempoolDotSpaceService } from './MempoolDotSpaceService.js';
import { SwapService } from './SwapService.js';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './HealthController.js';
import { PrometheusService } from './metrics/PrometheusService.js';
import { PrometheusController } from './metrics/PrometheusController.js';
import { LndChannelInfoMetricProvider } from './metrics/LndChannelInfoMetricProvider.js';
import { ElementsMetricProvider } from './metrics/ElementsMetricProvider.js';
import { LiquidService } from './LiquidService.js';
import { createLndService, LndService } from '@40swap/crypto-clients';

@Module({
    imports: [
        TypeOrmModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (configService: ConfigService<FortySwapConfiguration>) => {
                const config = configService.getOrThrow('db', { infer: true });
                return {
                    ...config,
                    type: 'postgres',
                    entities: [dirname(fileURLToPath(import.meta.url)) + '/**/entities/*{.ts,.js}'],
                    migrations: [dirname(fileURLToPath(import.meta.url)) + '/migrations/*{.ts,.js}'],
                    logging: ['schema', 'migration', 'info'],
                };
            },
        }),
        ConfigModule.forRoot({
            ignoreEnvFile: true,
            isGlobal: true,
            load: [configuration],
        }),
        EventEmitterModule.forRoot(),
        TerminusModule,
    ],
    controllers: [SwapInController, SwapOutController, ConfigurationController, HealthController, PrometheusController],
    providers: [
        NbxplorerService,
        BitcoinService,
        MempoolDotSpaceService,
        SwapService,
        LiquidService,
        PrometheusService,
        LndChannelInfoMetricProvider,
        ElementsMetricProvider,
        {
            inject: [ConfigService],
            useFactory: (configService: ConfigService<FortySwapConfiguration>) => {
                return createLndService(configService.getOrThrow('lnd', { infer: true }));
            },
            provide: LndService,
        },
        {
            inject: [BitcoinService],
            useFactory: (bitcoinService: BitcoinService) => {
                return bitcoinService.configurationDetails;
            },
            provide: BitcoinConfigurationDetails,
        },
        {
            inject: [LiquidService],
            useFactory: (liquidService: LiquidService) => {
                return liquidService.configurationDetails;
            },
            provide: 'LIQUID_CONFIG_DETAILS',
        },
        {
            inject: [ConfigService],
            useFactory: (configService: ConfigService<FortySwapConfiguration>) => {
                try {
                    return configService.get('elements', { infer: true });
                } catch (error) {
                    console.log('Elements configuration not found. Liquid functionality will be disabled.');
                    return undefined;
                }
            },
            provide: 'ELEMENTS_CONFIG',
        },
    ],
})
export class AppModule {}
