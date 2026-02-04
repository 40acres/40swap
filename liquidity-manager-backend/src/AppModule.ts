import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import configuration, { LiquidityManagerConfiguration } from './configuration.js';
import { loadSync } from '@grpc/proto-loader';
import { credentials, loadPackageDefinition, Metadata } from '@grpc/grpc-js';
import { ProtoGrpcType as LndGrpcType } from './lnd/lightning.js';
import { TerminusModule } from '@nestjs/terminus';
import { ChannelsController } from './ChannelsController.js';
import { ChannelsService } from './ChannelsService.js';
import { LndService } from './LndService.js';
import { SwapController } from './SwapController.js';
import { SwapService } from './SwapService.js';
import { BitfinexSwapStrategy } from './BitfinexSwapStrategy.js';
import { HealthController } from './HealthController.js';
import { LiquidService } from './LiquidService.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

@Module({
    imports: [
        ConfigModule.forRoot({
            ignoreEnvFile: true,
            isGlobal: true,
            load: [configuration],
        }),
        TerminusModule,
    ],
    controllers: [ChannelsController, SwapController, HealthController],
    providers: [
        ChannelsService,
        SwapService,
        BitfinexSwapStrategy,
        {
            provide: 'lnd-lightning',
            inject: [ConfigService],
            useFactory: (configService: ConfigService<LiquidityManagerConfiguration>) => {
                const config = configService.getOrThrow('lnd', { infer: true });
                const packageDefinition = loadSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'lnd/lightning.proto'), {
                    enums: String,
                });
                const proto = loadPackageDefinition(packageDefinition) as unknown as LndGrpcType;
                const sslCreds = credentials.createSsl(Buffer.from(config.cert, 'base64'));
                const macaroonCreds = credentials.createFromMetadataGenerator((args, callback) => {
                    const metadata = new Metadata();
                    metadata.add('macaroon', Buffer.from(config.macaroon, 'base64').toString('hex'));
                    callback(null, metadata);
                });
                const combinedCreds = credentials.combineChannelCredentials(sslCreds, macaroonCreds);
                return new proto.lnrpc.Lightning(config.socket, combinedCreds);
            },
        },
        LndService,
        LiquidService,
    ],
})
export class AppModule {}
