import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import configuration, { FortySwapConfiguration } from './configuration.js';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { LiquidService } from './LiquidService.js';
import { NbxplorerService } from './NbxplorerService.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BitcoinConfigurationDetails, BitcoinService } from './BitcoinService.js';
import { MempoolDotSpaceService } from './MempoolDotSpaceService.js';
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
    ],
    providers: [
        NbxplorerService,
        LndService,
        LiquidService,
        BitcoinService,
        MempoolDotSpaceService,
        {
            inject: [BitcoinService],
            useFactory: (bitcoinService: BitcoinService) => {
                return bitcoinService.configurationDetails;
            },
            provide: BitcoinConfigurationDetails,
        },
        {
            inject: [ConfigService],
            useFactory: (configService: ConfigService<FortySwapConfiguration>) => {
                return createLndService(configService.getOrThrow('lnd', { infer: true }));
            },
            provide: LndService,
        },

        // Elements configuration provider
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
    exports: [LndService, LiquidService],
})
export class CLIModule {}
