import { NestFactory } from '@nestjs/core';
import { AppModule } from './AppModule.js';
import { ConfigService } from '@nestjs/config';
import { FourtySwapConfiguration } from './configuration.js';

async function bootstrap(): Promise<void> {
    const app = await NestFactory.create(AppModule);
    app.enableShutdownHooks();
    const config = app.get(ConfigService<FourtySwapConfiguration>);
    const port = config.getOrThrow('server.port', { infer: true });
    await app.listen(port);
}

bootstrap();
