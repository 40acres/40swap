import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import configuration, { LiquidityManagerConfiguration } from './configuration.js';
import { loadSync } from '@grpc/proto-loader';
import { credentials, loadPackageDefinition, Metadata } from '@grpc/grpc-js';
import { ProtoGrpcType as LndGrpcType } from './lnd/lightning.js';
import { TerminusModule } from '@nestjs/terminus';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChannelsController } from './ChannelsController.js';
import { ChannelsService } from './ChannelsService.js';
import { LndService } from './LndService.js';
import { SwapController } from './SwapController.js';
import { SwapService } from './SwapService.js';
import { BitfinexSwapStrategy } from './BitfinexSwapStrategy.js';
import { DummySwapStrategy } from './DummySwapStrategy.js';
import { HealthController } from './HealthController.js';
import { LiquidService } from './LiquidService.js';
import { SwapHistoryController } from './SwapHistoryController.js';
import { SwapHistoryService } from './SwapHistoryService.js';
import { LiquiditySwap } from './entities/LiquiditySwap.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

@Module({
    imports: [
        TypeOrmModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (configService: ConfigService<LiquidityManagerConfiguration>) => {
                const config = configService.getOrThrow('db', { infer: true });
                return {
                    ...config,
                    type: 'postgres',
                    entities: [__dirname + '/**/entities/*{.ts,.js}'],
                    migrations: [__dirname + '/migrations/*{.ts,.js}'],
                    logging: ['schema', 'migration', 'info'],
                };
            },
        }),
        TypeOrmModule.forFeature([LiquiditySwap]),
        ConfigModule.forRoot({
            ignoreEnvFile: true,
            isGlobal: true,
            load: [configuration],
        }),
        TerminusModule,
    ],
    controllers: [ChannelsController, SwapController, SwapHistoryController, HealthController],
    providers: [
        ChannelsService,
        SwapService,
        SwapHistoryService,
        BitfinexSwapStrategy,
        DummySwapStrategy,
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
