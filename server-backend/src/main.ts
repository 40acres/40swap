import { NestFactory } from '@nestjs/core';
import { AppModule } from './AppModule.js';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { FortySwapConfiguration } from './configuration.js';
import { LogLevel } from '@nestjs/common';
import configurationLoader from './configuration.js';
import { Logger } from '@nestjs/common';

const logger = new Logger('ApplicationBootstrap');

async function bootstrap(): Promise<void> {
    const config = configurationLoader();
    const app = await NestFactory.create(AppModule, {
        logger: getLogLevels(config.server.environment),
    });
    app.enableShutdownHooks();
    const nestConfig = app.get(ConfigService<FortySwapConfiguration>);
    const port = nestConfig.getOrThrow('server.port', { infer: true });
    app.setGlobalPrefix('api', { exclude: ['metrics'] });
    const swaggerConfig = new DocumentBuilder().setTitle('40Swap').setDescription('The 40Swap REST API').setVersion('1.0').build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
    await app.listen(port);
}

function getLogLevels(environment?: string): LogLevel[] {
    if (environment === 'development' || environment === 'dev' || process.env.NODE_ENV === 'development') {
        logger.log('Log level set to development');
        return ['log', 'error', 'warn', 'debug', 'verbose', 'fatal'];
    }
    logger.log('Log level set to production');
    return ['log', 'error', 'warn', 'fatal'];
}

bootstrap();
