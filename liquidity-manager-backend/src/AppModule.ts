import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import configuration, { LiquidityManagerConfiguration } from './configuration.js';
import { createLndService, LndService } from '@40swap/crypto-clients';
import { TerminusModule } from '@nestjs/terminus';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChannelsController } from './ChannelsController.js';
import { ChannelsService } from './ChannelsService.js';
import { SwapController } from './SwapController.js';
import { SwapService } from './SwapService.js';
import { HealthController } from './HealthController.js';
import { LiquidService } from './LiquidService.js';
import { SwapHistoryController } from './SwapHistoryController.js';
import { SwapHistoryService } from './SwapHistoryService.js';
import { LiquiditySwap } from './entities/LiquiditySwap.js';
import { OidcService } from './OidcService.js';
import { AuthController } from './AuthController.js';
import { AuthGuard } from './AuthGuard.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { BitfinexClient } from './BitfinexClient.js';

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
    controllers: [ChannelsController, SwapController, SwapHistoryController, HealthController, AuthController],
    providers: [
        {
            provide: APP_GUARD,
            useClass: AuthGuard,
        },
        ChannelsService,
        SwapService,
        SwapHistoryService,
        OidcService,
        {
            provide: LndService,
            inject: [ConfigService],
            useFactory: (configService: ConfigService<LiquidityManagerConfiguration>) => {
                return createLndService(configService.getOrThrow('lnd', { infer: true }));
            },
        },
        LiquidService,
        {
            provide: BitfinexClient,
            inject: [ConfigService],
            useFactory: (configService: ConfigService<LiquidityManagerConfiguration>) => {
                const config = configService.getOrThrow('bitfinex', { infer: true });
                return new BitfinexClient(config);
            },
        },
    ],
})
export class AppModule {}
