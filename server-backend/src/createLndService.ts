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

// Interface para la configuración LND
interface LndConfig {
    socket: string;
    cert: string;
    macaroon: string;
}

// Función para leer configuración desde archivos locales
function loadLndConfigFromFiles(): LndConfig {
    // Intentar cargar desde archivos locales en el directorio daemon
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
            socket: 'localhost:10009', // Puerto por defecto de LND
            cert,
            macaroon,
        };
    } catch (error) {
        console.error('❌ Error loading LND configuration from files:', error);
        throw new Error('Failed to load LND configuration. Please ensure LND cert and macaroon files are available.');
    }
}

// Función para crear clientes GRPC de LND
function createLndClients(config: LndConfig): { lightningClient: LightningClient; invoicesClient: InvoicesClient } {
    // Crear cliente Lightning
    const lightningPd = loadSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'lnd/lightning.proto'), { enums: String });
    const lightningGrpcType = loadPackageDefinition(lightningPd) as unknown as LndGrpcType;

    // Crear cliente Invoices
    const invoicesPd = loadSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'lnd/invoices.proto'), { enums: String });
    const invoicesGrpcType = loadPackageDefinition(invoicesPd) as unknown as InvoicesGrpcType;

    // Configurar credenciales SSL
    const sslCreds = credentials.createSsl(Buffer.from(config.cert, 'base64'));

    // Configurar credenciales de macaroon
    const macaroonCreds = credentials.createFromMetadataGenerator((_, callback) => {
        const metadata = new Metadata();
        metadata.add('macaroon', Buffer.from(config.macaroon, 'base64').toString('hex'));
        callback(null, metadata);
    });

    // Combinar credenciales
    const combinedCreds = credentials.combineChannelCredentials(sslCreds, macaroonCreds);

    // Crear clientes
    const lightningClient = new lightningGrpcType.lnrpc.Lightning(config.socket, combinedCreds);
    const invoicesClient = new invoicesGrpcType.invoicesrpc.Invoices(config.socket, combinedCreds);

    return { lightningClient, invoicesClient };
}

/**
 * Crea una instancia de LndService para uso en CLI
 * Esta función replica la configuración del AppModule pero para uso standalone
 */
export function createLndServiceForCLI(): LndService {
    try {
        console.log('🔧 Initializing LND service for CLI...');

        // Cargar configuración
        const config = loadLndConfigFromFiles();
        console.log(`📡 Connecting to LND at: ${config.socket}`);

        // Crear clientes GRPC
        const { lightningClient, invoicesClient } = createLndClients(config);

        // Crear instancia de LndService usando los mismos parámetros que en AppModule
        // Necesitamos crear un objeto que simule la inyección de dependencias
        const lndService = new (class extends LndService {
            constructor() {
                // Usar Object.defineProperty para inyectar las dependencias privadas
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
 * Función para validar que LND esté accesible
 */
export async function validateLndConnection(lndService: LndService): Promise<boolean> {
    try {
        console.log('🔍 Validating LND connection...');

        // Intentar obtener información básica del nodo
        await lndService.getNewAddress();

        console.log('✅ LND connection validated successfully');
        return true;
    } catch (error) {
        console.error('❌ LND connection validation failed:', error);
        return false;
    }
}
