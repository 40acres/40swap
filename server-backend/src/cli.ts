#!/usr/bin/env node

import { Command } from 'commander';
import { BitfinexProvider } from './providers/BitfinexProvider.js';
import { SwapProvider } from './providers/SwapProvider.js';

const program = new Command();

program.name('cli').description('40swap backend CLI').version('1.0.0');

program.requiredOption('-k, --id-key <string>', 'Bitfinex API ID Key');
program.requiredOption('-s, --secret-key <string>', 'Bitfinex API Secret');

program
    .command('send')
    .description('Send funds to lightning wallet within Bitfinex account')
    .option('-a, --amount <number>', 'Amount to send', '0.001')
    .option('-d, --destination <string>', 'Destination address (optional)')
    .action(async (cmdOptions) => {
        try {
            console.log('🚀 Send command executed');
            const globalOptions = program.opts();

            const provider: SwapProvider = new BitfinexProvider(globalOptions.idKey, globalOptions.secretKey);

            const amount = parseFloat(cmdOptions.amount);
            const result = await provider.send(amount, cmdOptions.destination);

            console.log('✅ Send Result:', JSON.stringify(result, null, 2));
        } catch (error) {
            console.error('❌ Send failed:', error);
            process.exit(1);
        }
    });

program
    .command('withdraw')
    .description('Withdraw funds from Bitfinex account to external liquid wallet')
    .option('-a, --amount <number>', 'Amount to withdraw', '0.001')
    .requiredOption('-d, --destination <string>', 'Liquid destination wallet address')
    .action(async (cmdOptions) => {
        try {
            console.log('💰 Withdraw command executed');
            const globalOptions = program.opts();

            const provider: SwapProvider = new BitfinexProvider(globalOptions.idKey, globalOptions.secretKey);

            const amount = parseFloat(cmdOptions.amount);
            const result = await provider.withdraw(amount, cmdOptions.address);

            console.log('✅ Withdraw Result:', JSON.stringify(result, null, 2));
        } catch (error) {
            console.error('❌ Withdraw failed:', error);
            process.exit(1);
        }
    });

program
    .command('swap')
    .description('Execute complete swap: BTC → Lightning → Liquid')
    .option('-a, --amount <number>', 'Amount to swap', '0.001')
    .requiredOption('-d, --destination <string>', 'Liquid destination wallet address')
    .action(async (cmdOptions) => {
        try {
            console.log('🔄 Swap command executed');
            const globalOptions = program.opts();

            const provider: SwapProvider = new BitfinexProvider(globalOptions.idKey, globalOptions.secretKey);

            const amount = parseFloat(cmdOptions.amount);
            const result = await provider.swap(amount, cmdOptions.address);

            console.log('✅ Complete Swap Result:', JSON.stringify(result, null, 2));
        } catch (error) {
            console.error('❌ Swap failed:', error);
            process.exit(1);
        }
    });

program
    .command('wallets')
    .description('Get wallet balances from Bitfinex')
    .action(async () => {
        try {
            console.log('💼 Getting wallet information');
            const globalOptions = program.opts();

            const provider = new BitfinexProvider(globalOptions.idKey, globalOptions.secretKey);
            const result = await provider.getWallets();

            console.log('👀 Wallets:', JSON.stringify(result, null, 2));
        } catch (error) {
            console.error('❌ Getting wallets failed:', error);
            process.exit(1);
        }
    });

program
    .command('list-addresses')
    .description('Get deposit addresses from Bitfinex')
    .action(async () => {
        try {
            console.log('💼 Getting deposit addresses');
            const globalOptions = program.opts();

            const provider = new BitfinexProvider(globalOptions.idKey, globalOptions.secretKey);
            const result = await provider.getDepositAddresses();

            console.log('👀 Deposit Addresses:', JSON.stringify(result, null, 2));
        } catch (error) {
            console.error('❌ Getting deposit addresses failed:', error);
            process.exit(1);
        }
    });

program
    .command('create-address')
    .description('Create new deposit address on Bitfinex')
    .option('-w, --wallet <string>', 'Wallet type (default: exchange)', 'exchange')
    .option('-m, --method <string>', 'Deposit method (default: bitcoin)', 'bitcoin')
    .action(async () => {
        try {
            console.log('💼 Creating new deposit address');
            const globalOptions = program.opts();

            const provider = new BitfinexProvider(globalOptions.idKey, globalOptions.secretKey);
            const result = await provider.createDepositAddress('LNX', 'exchange');

            console.log('👀 Deposit Address Created:', JSON.stringify(result, null, 2));
        } catch (error) {
            console.error('❌ Creating deposit address failed:', error);
            process.exit(1);
        }
    });

program.parse();
