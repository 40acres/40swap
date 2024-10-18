import { NestFactory } from '@nestjs/core';
import { AppModule } from './AppModule.js';
import { ConfigService } from '@nestjs/config';
import { FourtySwapConfiguration } from './configuration.js';
import { LogLevel } from '@nestjs/common';

async function bootstrap(): Promise<void> {
    const app = await NestFactory.create(AppModule, {
        logger: getLogLevels(),
    });
    app.enableShutdownHooks();
    const config = app.get(ConfigService<FourtySwapConfiguration>);
    const port = config.getOrThrow('server.port', { infer: true });
    app.setGlobalPrefix('api');
    await app.listen(port);
}

function getLogLevels(): LogLevel[] {
    if (process.env.NODE_ENV === 'development') {
        return ['log', 'error', 'warn', 'debug', 'verbose', 'fatal'];
    }
    return ['log', 'error', 'warn', 'fatal'];
}

bootstrap();
