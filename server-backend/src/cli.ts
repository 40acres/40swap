#!/usr/bin/env node

import { Command } from 'commander';

const program = new Command();

program.name('cli').description('40swap backend CLI').version('1.0.0');

program.requiredOption('-k, --id-key <string>', 'Bitfinex API ID Key');
program.requiredOption('-s, --secret-key <string>', 'Bitfinex API Secret');

program
    .command('send')
    .description('Send funds to lightning wallet within Bitfinex account')
    .action(async () => {
        console.log('🚀 Send command executed');
        const options = program.opts();
        console.log(`Using ID Key: ${options.idKey}`);
        console.log(`Using Secret Key: ${options.secretKey}`);
    });

program
    .command('withdraw')
    .description('Withdraw funds from Bitfinex account to external liquid wallet')
    .action(async () => {
        console.log('💰 Withdraw command executed');
        const options = program.opts();
        console.log(`Using ID Key: ${options.idKey}`);
        console.log(`Using Secret Key: ${options.secretKey}`);
    });

program.parse();
