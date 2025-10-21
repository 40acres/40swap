import { Module } from '@nestjs/common';
import { SwapInController } from './SwapInController.js';
import { ConfigModule, ConfigService } from '@nestjs/config';
import configuration, { FortySwapConfiguration } from './configuration.js';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadSync } from '@grpc/proto-loader';
import { credentials, loadPackageDefinition, Metadata } from '@grpc/grpc-js';
import { ProtoGrpcType as LndGrpcType } from './lnd/lightning.js';
import { ProtoGrpcType as InvoicesGrpcType } from './lnd/invoices.js';
import { NbxplorerService } from './NbxplorerService.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { LndService } from './LndService.js';
import { SwapOutController } from './SwapOutController.js';
import { BitcoinConfigurationDetails, BitcoinService } from './BitcoinService.js';
import { ConfigurationController } from './ConfigurationController.js';
import { MempoolDotSpaceService } from './MempoolDotSpaceService.js';
import { SwapService } from './SwapService.js';
import { TerminusModule } from '@nestjs/terminus';
import { LiquidService } from './LiquidService.js';
import { HealthController } from './HealthController.js';
import { PrometheusService } from './metrics/PrometheusService.js';
import { PrometheusController } from './metrics/PrometheusController.js';
import { LndChannelInfoMetricProvider } from './metrics/LndChannelInfoMetricProvider.js';
import { ElementsMetricProvider } from './metrics/ElementsMetricProvider.js';

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
        LndService,
        BitcoinService,
        MempoolDotSpaceService,
        SwapService,
        LiquidService,
        PrometheusService,
        LndChannelInfoMetricProvider,
        ElementsMetricProvider,
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
                const config = configService.getOrThrow('lnd', { infer: true });
                const pd = loadSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'lnd/lightning.proto'), {
                    enums: String,
                });
                const grpcType = loadPackageDefinition(pd) as unknown as LndGrpcType;
                const sslCreds = credentials.createSsl(Buffer.from(config.cert, 'base64'));
                const macaroonCreds = credentials.createFromMetadataGenerator((_, callback) => {
                    const metadata = new Metadata();
                    metadata.add('macaroon', Buffer.from(config.macaroon, 'base64').toString('hex'));
                    callback(null, metadata);
                });
                return new grpcType.lnrpc.Lightning(config.socket, credentials.combineChannelCredentials(sslCreds, macaroonCreds));
            },
            provide: 'lnd-lightning',
        },
        {
            inject: [ConfigService],
            useFactory: (configService: ConfigService<FortySwapConfiguration>) => {
                const config = configService.getOrThrow('lnd', { infer: true });
                const pd = loadSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'lnd/invoices.proto'), {
                    enums: String,
                });
                const grpcType = loadPackageDefinition(pd) as unknown as InvoicesGrpcType;
                const sslCreds = credentials.createSsl(Buffer.from(config.cert, 'base64'));
                const macaroonCreds = credentials.createFromMetadataGenerator((_, callback) => {
                    const metadata = new Metadata();
                    metadata.add('macaroon', Buffer.from(config.macaroon, 'base64').toString('hex'));
                    callback(null, metadata);
                });
                return new grpcType.invoicesrpc.Invoices(config.socket, credentials.combineChannelCredentials(sslCreds, macaroonCreds));
            },
            provide: 'lnd-invoices',
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
