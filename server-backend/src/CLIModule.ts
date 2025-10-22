import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import configuration, { FortySwapConfiguration } from './configuration.js';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadSync } from '@grpc/proto-loader';
import { credentials, loadPackageDefinition, Metadata } from '@grpc/grpc-js';
import { ProtoGrpcType as LndGrpcType } from './lnd/lightning.js';
import { ProtoGrpcType as InvoicesGrpcType } from './lnd/invoices.js';
import { LndService } from './LndService.js';
import { LiquidService } from './LiquidService.js';
import { NbxplorerService } from './NbxplorerService.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';

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
        // NBXplorer service - required by LiquidService
        NbxplorerService,

        // LND Service
        LndService,

        // Liquid Service
        LiquidService,

        // LND Lightning client provider
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

        // LND Invoices client provider
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
