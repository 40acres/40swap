import { NestFactory } from '@nestjs/core';
import { AppModule } from './AppModule.js';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { LiquidityManagerConfiguration } from './configuration.js';
import { LogLevel } from '@nestjs/common';
import configurationLoader from './configuration.js';
import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import session from 'express-session';
import ConnectPgSimple from 'connect-pg-simple';
import pg from 'pg';

const logger = new Logger('ApplicationBootstrap');

async function bootstrap(): Promise<void> {
    const config = configurationLoader();
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
        logger: getLogLevels(config.server.environment),
    });
    app.enableShutdownHooks();
    app.disable('x-powered-by');

    // Configure session store
    const authConfig = config.auth;
    const PgSession = ConnectPgSimple(session);
    const pgPool = new pg.Pool({
        host: config.db.host,
        port: config.db.port,
        user: config.db.username,
        password: config.db.password,
        database: config.db.database,
    });

    app.use(
        session({
            store: new PgSession({
                pool: pgPool,
                tableName: 'session',
                createTableIfMissing: false,
            }),
            secret: authConfig.session.secret,
            resave: false,
            saveUninitialized: false,
            cookie: {
                maxAge: authConfig.session.maxAge,
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
            },
        }),
    );

    const nestConfig = app.get(ConfigService<LiquidityManagerConfiguration>);
    const port = nestConfig.getOrThrow('server.port', { infer: true });
    app.setGlobalPrefix('api');
    const swaggerConfig = new DocumentBuilder()
        .setTitle('Liquidity Manager')
        .setDescription('The Lightning Liquidity Manager REST API')
        .setVersion('1.0')
        .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
    await app.listen(port);
}

function getLogLevels(environment?: string): LogLevel[] {
    if (environment === 'development' || process.env.NODE_ENV === 'development') {
        logger.log('Log level set to development');
        return ['log', 'error', 'warn', 'debug', 'verbose', 'fatal'];
    }
    logger.log('Log level set to production');
    return ['log', 'error', 'warn', 'fatal'];
}

bootstrap();
