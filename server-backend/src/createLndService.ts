import { credentials, loadPackageDefinition, Metadata } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { LightningClient } from './lnd/lnrpc/Lightning.js';
import { InvoicesClient } from './lnd/invoicesrpc/Invoices.js';
import { LndService } from './LndService.js';
import { ProtoGrpcType as LndGrpcType } from './lnd/lightning.js';
import { ProtoGrpcType as InvoicesGrpcType } from './lnd/invoices.js';

/**
 * Interface for LND configuration settings.
 */
interface LndConfig {
    socket: string;
    cert: string;
    macaroon: string;
}

/**
 * Loads LND configuration from local files in the daemon directory.
 * @returns LndConfig object with socket, cert, and macaroon
 * @throws Error if cert or macaroon files are not found
 */
function loadLndConfigFromFiles(): LndConfig {
    // Try to load from local files in the daemon directory
    const daemonPath = path.resolve(process.cwd(), '../daemon');

    try {
        const certPath = path.join(daemonPath, 'tls.cert');
        const macaroonPath = path.join(daemonPath, 'admin.macaroon');

        if (!fs.existsSync(certPath) || !fs.existsSync(macaroonPath)) {
            throw new Error('LND cert or macaroon files not found in daemon directory');
        }

        const cert = fs.readFileSync(certPath, 'base64');
        const macaroon = fs.readFileSync(macaroonPath, 'base64');

        return {
            socket: 'localhost:10009', // Default LND port
            cert,
            macaroon,
        };
    } catch (error) {
        console.error('❌ Error loading LND configuration from files:', error);
        throw new Error('Failed to load LND configuration. Please ensure LND cert and macaroon files are available.');
    }
}

/**
 * Creates LND GRPC clients for Lightning and Invoices services.
 * @param config - LND configuration object
 * @returns Object containing lightningClient and invoicesClient
 */
function createLndClients(config: LndConfig): { lightningClient: LightningClient; invoicesClient: InvoicesClient } {
    // Create Lightning client
    const lightningPd = loadSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'lnd/lightning.proto'), { enums: String });
    const lightningGrpcType = loadPackageDefinition(lightningPd) as unknown as LndGrpcType;

    // Create Invoices client
    const invoicesPd = loadSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'lnd/invoices.proto'), { enums: String });
    const invoicesGrpcType = loadPackageDefinition(invoicesPd) as unknown as InvoicesGrpcType;

    // Configure SSL credentials
    const sslCreds = credentials.createSsl(Buffer.from(config.cert, 'base64'));

    // Configure macaroon credentials
    const macaroonCreds = credentials.createFromMetadataGenerator((_, callback) => {
        const metadata = new Metadata();
        metadata.add('macaroon', Buffer.from(config.macaroon, 'base64').toString('hex'));
        callback(null, metadata);
    });

    // Combine credentials
    const combinedCreds = credentials.combineChannelCredentials(sslCreds, macaroonCreds);

    // Create clients
    const lightningClient = new lightningGrpcType.lnrpc.Lightning(config.socket, combinedCreds);
    const invoicesClient = new invoicesGrpcType.invoicesrpc.Invoices(config.socket, combinedCreds);

    return { lightningClient, invoicesClient };
}

/**
 * Creates an LndService instance for CLI usage.
 * This function replicates the AppModule configuration but for standalone use.
 * @returns Configured LndService instance
 * @throws Error if LND service initialization fails
 */
export function createLndServiceForCLI(): LndService {
    try {
        console.log('🔧 Initializing LND service for CLI...');

        // Load configuration
        const config = loadLndConfigFromFiles();
        console.log(`📡 Connecting to LND at: ${config.socket}`);

        // Create GRPC clients
        const { lightningClient, invoicesClient } = createLndClients(config);

        // Create LndService instance using the same parameters as AppModule
        // We need to create an object that simulates dependency injection
        const lndService = new (class extends LndService {
            constructor() {
                // Use Object.defineProperty to inject private dependencies
                super(lightningClient as LightningClient, invoicesClient as InvoicesClient);
            }
        })();

        console.log('✅ LND service initialized successfully for CLI');
        return lndService;
    } catch (error) {
        console.error('❌ Failed to initialize LND service:', error);
        throw error;
    }
}

/**
 * Validates that LND is accessible and responsive.
 * @param lndService - The LndService instance to validate
 * @returns Promise resolving to true if connection is valid, false otherwise
 */
export async function validateLndConnection(lndService: LndService): Promise<boolean> {
    try {
        console.log('🔍 Validating LND connection...');

        // Try to get basic node information
        await lndService.getNewAddress();

        console.log('✅ LND connection validated successfully');
        return true;
    } catch (error) {
        console.error('❌ LND connection validation failed:', error);
        return false;
    }
}
