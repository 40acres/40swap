import { NestFactory } from '@nestjs/core';
import { AppModule } from './AppModule.js';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { FortySwapConfiguration } from './configuration.js';
import { LogLevel } from '@nestjs/common';

async function bootstrap(): Promise<void> {
    const app = await NestFactory.create(AppModule, {
        logger: getLogLevels(),
    });
    app.enableShutdownHooks();
    const config = app.get(ConfigService<FortySwapConfiguration>);
    const port = config.getOrThrow('server.port', { infer: true });
    app.setGlobalPrefix('api', { exclude: ['metrics'] });
    const swaggerConfig = new DocumentBuilder().setTitle('40Swap').setDescription('The 40Swap REST API').setVersion('1.0').build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
    await app.listen(port);
}

function getLogLevels(): LogLevel[] {
    if (process.env.NODE_ENV === 'development') {
        return ['log', 'error', 'warn', 'debug', 'verbose', 'fatal'];
    }
    return ['log', 'error', 'warn', 'fatal'];
}

bootstrap();
