#!/usr/bin/env node

import { Command } from 'commander';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './AppModule.js';
import { HelloCommand } from './commands/hello.command.js';

const program = new Command();

program.name('40swap-cli').description('CLI para el backend de 40Swap').version('1.0.0');

program
    .command('hello')
    .description('Muestra un saludo de Hello World')
    .action(async () => {
        const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

        try {
            const helloCommand = app.get(HelloCommand);
            await helloCommand.execute();
        } catch (error) {
            console.error('Error ejecutando el comando hello:', error);
            process.exit(1);
        } finally {
            await app.close();
        }
    });

program.parse();
