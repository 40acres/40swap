#!/usr/bin/env node

/**
 * 40swap backend CLI tool for interacting with Bitfinex API and Lightning Network.
 * Provides commands for wallet management, invoice generation, payments, and currency exchanges.
 */

import { Command } from 'commander';
import { NestFactory } from '@nestjs/core';
import { CLIModule } from './CLIModule.js';
import { BitfinexProvider } from './providers/BitfinexProvider.js';
import { LndService } from './LndService.js';
import { LiquidService } from './LiquidService.js';
import { INestApplicationContext } from '@nestjs/common';
import configuration from './configuration.js';

const program = new Command();

// Global NestJS application context
let app: INestApplicationContext;

program
    .name('cli')
    .description('40swap backend CLI')
    .version('1.0.0')
    .addHelpText(
        'after',
        `
⚠️ If running in production, remember to run it under the '/dist' folder where the compiled JS files are.
Use 'npm run cli -- <command> <flags>' from the project root while working on dev.
Use 'node cli.js <command> <flags>' when in production under '/dist'.
Examples:
  $ node cli.js swap -a 0.0001 -d <liquid_address>
  $ node cli.js wallets
  $ node cli.js list-addresses -m LNX -p 1 -s 100
  $ node cli.js create-address -w exchange -m BTC
  $ node cli.js create-invoice -a 0.000001
  $ node cli.js get-invoices -a getInvoicesByUser -o 0
  $ node cli.js pay-invoice -i <invoice> -c 40
  $ node cli.js monitor-invoice -t <txid> -r 10 -i 5000
  $ node cli.js exchange -f BTC -t LNX -a 0.0001 -o exchange -d exchange
  $ node cli.js withdraw -a 0.001 -d <destination_address> -c BTC -w exchange -t <tag>
`,
    );

program.option('-k, --id-key <string>', 'Bitfinex API ID Key (got from env vars if not passed)');
program.option('-s, --secret-key <string>', 'Bitfinex API Secret (got from env vars if not passed)');

/**
 * Gets Bitfinex credentials from configuration file or CLI options.
 * Throws an error if credentials are not available from either source.
 */
function getBitfinexCredentials(): { apiKey: string; apiSecret: string } {
    const globalOptions = program.opts();

    // Try to get credentials from CLI options first
    if (globalOptions.idKey && globalOptions.secretKey) {
        return {
            apiKey: globalOptions.idKey,
            apiSecret: globalOptions.secretKey,
        };
    }

    // If not provided via CLI, try to get from configuration
    try {
        const config = configuration();
        if (config.bitfinex?.apiKey && config.bitfinex?.apiSecret) {
            return {
                apiKey: config.bitfinex.apiKey,
                apiSecret: config.bitfinex.apiSecret,
            };
        }
    } catch (error) {
        // Configuration loading failed, continue to error below
    }

    // Neither CLI options nor configuration provided the credentials
    throw new Error(
        '❌ Bitfinex API credentials not found. Please provide them either:\n' +
            '   • As CLI options: --id-key <key> --secret-key <secret>\n' +
            '   • In configuration file under bitfinex.apiKey and bitfinex.apiSecret',
    );
}

/**
 * Initializes the NestJS application context for dependency injection.
 * This provides the same services as the main application.
 */
async function initializeApp(): Promise<INestApplicationContext> {
    if (!app) {
        console.log('🔧 Initializing NestJS application context...');
        app = await NestFactory.createApplicationContext(CLIModule, {
            logger: false, // Disable NestJS logs for CLI
        });
        console.log('✅ Application context initialized');
    }
    return app;
}

/**
 * Gets an LndService instance from the NestJS container.
 * This ensures we use the same configuration as the main application.
 * @returns LndService instance
 */
async function getLndService(appContext: INestApplicationContext): Promise<LndService> {
    console.log('🔧 Getting LND service from application context...');
    return appContext.get(LndService);
}

/**
 * Gets a LiquidService instance from the NestJS container.
 * This ensures we use the same configuration as the main application.
 * @returns LiquidService instance
 */
async function getElementsService(appContext: INestApplicationContext): Promise<LiquidService> {
    console.log('🔧 Getting Elements service from application context...');
    return appContext.get(LiquidService);
}

/**
 * Creates a BitfinexProvider instance with credentials from configuration or CLI options.
 * This centralizes the provider initialization logic.
 */
async function getBitfinexProvider(): Promise<BitfinexProvider> {
    const credentials = getBitfinexCredentials();
    const appContext = await initializeApp();
    const lndService = await getLndService(appContext);
    const elements = await getElementsService(appContext);
    return new BitfinexProvider(credentials.apiKey, credentials.apiSecret, lndService, elements);
}

/**
 * Cleanup function to close the NestJS application context.
 */
async function cleanup(): Promise<void> {
    if (app) {
        await app.close();
    }
}

// Register cleanup handlers
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);

program
    .command('swap')
    .description('Execute complete swap: Lightning → Liquid')
    .requiredOption('-a, --amount <number>', 'Amount to swap')
    .option('-d, --destination <string>', 'Liquid destination wallet address')
    .action(async (cmdOptions) => {
        try {
            console.log('🔄 Swap command executed');
            const provider = await getBitfinexProvider();
            await provider.swap(parseFloat(cmdOptions.amount), cmdOptions.destination);
            console.log('🎉 Complete swap operation finished successfully!');
        } catch (error) {
            console.error('❌ Swap failed:', error);
            process.exit(1);
        } finally {
            await cleanup();
        }
    });

program
    .command('wallets')
    .description('Get wallet balances from Bitfinex')
    .action(async () => {
        try {
            console.log('💼 Getting wallet information');
            const provider = await getBitfinexProvider();
            const result = await provider.getWallets();
            console.log('👀 Wallets:', JSON.stringify(result, null, 2));
        } catch (error) {
            console.error('❌ Getting wallets failed:', error);
            process.exit(1);
        } finally {
            await cleanup();
        }
    });

program
    .command('list-addresses')
    .description('Get deposit addresses from Bitfinex')
    .option('-m, --method <string>', 'Deposit method (default: LNX)', 'LNX')
    .option('-p, --page <number>', 'Page number for pagination (default: 1)', '1')
    .option('-s, --page-size <number>', 'Page size for pagination (default: 100)', '100')
    .action(async (cmdOptions) => {
        try {
            console.log('💼 Getting deposit addresses');
            const provider = await getBitfinexProvider();
            const result = await provider.getDepositAddresses(cmdOptions.method, cmdOptions.page, cmdOptions.pageSize);
            console.log('👀 Deposit Addresses:', JSON.stringify(result, null, 2));
        } catch (error) {
            console.error('❌ Getting deposit addresses failed:', error);
            process.exit(1);
        } finally {
            await cleanup();
        }
    });

program
    .command('create-address')
    .description('Create new deposit address on Bitfinex')
    .option('-w, --wallet <string>', 'Wallet type (default: exchange)', 'exchange')
    // For more methods info: https://api-pub.bitfinex.com//v2/conf/pub:map:tx:method
    // https://docs.bitfinex.com/reference/rest-auth-deposit-address
    .option('-m, --method <string>', 'Deposit method (default: BTC)', 'BTC')
    .action(async (cmdOptions) => {
        try {
            console.log('💼 Creating new deposit address');
            const provider = await getBitfinexProvider();
            const result = await provider.createDepositAddress(cmdOptions.wallet, cmdOptions.method);
            console.log('👀 Deposit Address Created:', JSON.stringify(result, null, 2));
        } catch (error) {
            console.error('❌ Creating deposit address failed:', error);
            process.exit(1);
        } finally {
            await cleanup();
        }
    });

program
    .command('create-invoice')
    .description('Create a new Lightning invoice on Bitfinex')
    .option('-a, --amount <number>', 'Amount to invoice min 0.000001, max 0.02 (default: 0.000001)', '0.000001')
    .action(async (cmdOptions) => {
        try {
            console.log('💼 Creating new Lightning invoice');
            const provider = await getBitfinexProvider();
            const result = await provider.generateInvoice(cmdOptions.amount);
            console.log('👀 Lightning Invoice Created:', JSON.stringify(result, null, 2));
        } catch (error) {
            console.error('❌ Creating Lightning invoice failed:', error);
            process.exit(1);
        } finally {
            await cleanup();
        }
    });

program
    .command('get-invoices')
    .description('Get Lightning invoices and payments from Bitfinex')
    .option(
        '-a, --action <string>',
        'Query action: getPaymentsByUser, getInvoicesByUser, getInvoiceById, getPaymentById (default: getInvoicesByUser)',
        'getInvoicesByUser',
    )
    .option('-t, --txid <string>', 'Transaction ID/Payment hash (required for getInvoiceById and getPaymentById)')
    .option('-o, --offset <number>', 'Offset for pagination (supported by getInvoicesByUser and getPaymentsByUser)', '0')
    .action(async (cmdOptions) => {
        try {
            console.log('⚡ Getting Lightning invoices/payments');
            const provider = await getBitfinexProvider();

            // Construct the query object
            const query: { offset?: number; txid?: string } = {};

            // Add offset if provided and compatible with the action
            if (cmdOptions.offset && (cmdOptions.action === 'getInvoicesByUser' || cmdOptions.action === 'getPaymentsByUser')) {
                query.offset = parseInt(cmdOptions.offset);
            }

            // Add txid if provided and required by the action
            if (cmdOptions.txid && (cmdOptions.action === 'getInvoiceById' || cmdOptions.action === 'getPaymentById')) {
                query.txid = cmdOptions.txid;
            }

            const result = await provider.getLnxInvoicePayments(cmdOptions.action, query);
            console.log('👀 Lightning Invoices/Payments:', JSON.stringify(result, null, 2));
        } catch (error) {
            console.error('❌ Getting Lightning invoices/payments failed:', error);
            process.exit(1);
        } finally {
            await cleanup();
        }
    });

program
    .command('pay-invoice')
    .description('Pay a Lightning Network invoice using LND (uses NestJS dependency injection)')
    .requiredOption('-i, --invoice <string>', 'Lightning invoice to pay (payment request string)')
    .option('-c, --cltv-limit <number>', 'CLTV limit for the payment (default: 40)', '40')
    .action(async (cmdOptions) => {
        try {
            console.log('⚡ Paying Lightning invoice using LND');
            const provider = await getBitfinexProvider();
            const result = await provider.payInvoice(cmdOptions.invoice, parseInt(cmdOptions.cltvLimit));

            if (result.success) {
                console.log('✅ Payment successful!');
                console.log('🔑 Preimage:', result.preimage);
            } else {
                console.log('❌ Payment failed:', result.error);
                process.exit(1);
            }
        } catch (error) {
            console.error('❌ Paying invoice failed:', error);
            process.exit(1);
        } finally {
            await cleanup();
        }
    });

program
    .command('monitor-invoice')
    .description('Monitor a Lightning invoice until it is paid or max retries reached')
    .requiredOption('-t, --txid <string>', 'Transaction ID/Payment hash of the invoice to monitor')
    .option('-r, --max-retries <number>', 'Maximum number of retry attempts (default: 10)', '10')
    .option('-i, --interval <number>', 'Interval between checks in milliseconds (default: 5000)', '5000')
    .action(async (cmdOptions) => {
        try {
            console.log('👁️ Starting invoice monitoring');
            const provider = await getBitfinexProvider();

            const result = await provider.monitorInvoice(cmdOptions.txid, parseInt(cmdOptions.maxRetries), parseInt(cmdOptions.interval));

            if (result.success) {
                console.log(`🎉 Invoice monitoring successful! Final state: ${result.finalState}`);
                console.log(`📊 Total attempts: ${result.attempts}`);
                console.log('👀 Final invoice data:', JSON.stringify(result.invoice, null, 2));
            } else {
                console.log(`⏰ Invoice monitoring timed out after ${result.attempts} attempts`);
                console.log(`📊 Final state: ${result.finalState}`);
            }
        } catch (error) {
            console.error('❌ Invoice monitoring failed:', error);
            process.exit(1);
        } finally {
            await cleanup();
        }
    });

program
    .command('exchange')
    .description('Convert one currency to another using wallet transfers')
    .requiredOption('-f, --from <string>', 'Currency to convert from (e.g., BTC, LBT, LNX)')
    .requiredOption('-t, --to <string>', 'Currency to convert to (e.g., BTC, LBT, LNX)')
    .requiredOption('-a, --amount <number>', 'Amount to convert')
    .option('-o, --origin <string>', 'Source wallet type (default: exchange)', 'exchange')
    .option('-d, --destination <string>', 'Destination wallet type (default: exchange)', 'exchange')
    .action(async (cmdOptions) => {
        try {
            console.log('🔄 Executing currency conversion');
            const provider = await getBitfinexProvider();

            const result = await provider.exchangeCurrency(
                cmdOptions.from.toUpperCase(),
                cmdOptions.to.toUpperCase(),
                parseFloat(cmdOptions.amount),
                cmdOptions.origin,
                cmdOptions.destination,
            );

            console.log('👀 Currency Conversion Result:', JSON.stringify(result, null, 2));
        } catch (error) {
            console.error('❌ Currency conversion failed:', error);
            process.exit(1);
        } finally {
            await cleanup();
        }
    });

program
    .command('withdraw')
    .description('Withdraw funds from Bitfinex account to external wallet')
    .option('-a, --amount <number>', 'Amount to withdraw', '0.001')
    .requiredOption('-d, --destination <string>', 'Destination wallet address')
    .option('-c, --currency <string>', 'Currency to withdraw (BTC, LBT, LNX)')
    .option('-w, --wallet <string>', 'Source wallet type (exchange, margin, funding)', 'exchange')
    .option('-t, --tag <string>', 'Optional tag/memo for certain networks')
    .action(async (cmdOptions) => {
        try {
            console.log('💰 Withdraw command executed');
            const provider = await getBitfinexProvider();

            const result = await provider.withdraw(
                parseFloat(cmdOptions.amount),
                cmdOptions.destination,
                cmdOptions.currency,
                cmdOptions.wallet,
                cmdOptions.tag,
            );

            console.log('✅ Withdraw Result:', JSON.stringify(result, null, 2));
        } catch (error) {
            console.error('❌ Withdraw failed:', error);
            process.exit(1);
        } finally {
            await cleanup();
        }
    });

// @ts-ignore
await program.parseAsync();
