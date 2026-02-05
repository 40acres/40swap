import * as path from 'node:path';
import { LightningClient } from './lnd/lnrpc/Lightning.js';
import { InvoicesClient } from './lnd/invoicesrpc/Invoices.js';
import { loadSync } from '@grpc/proto-loader';
import { fileURLToPath } from 'url';
import { credentials, loadPackageDefinition, Metadata } from '@grpc/grpc-js';
import { ProtoGrpcType as LndGrpcType } from './lnd/lightning.js';
import { ProtoGrpcType as InvoicesGrpcType } from './lnd/invoices.js';
import { LndService } from './LndService.js';

export { LndService } from './LndService.js';
export { Channel__Output as ChannelOutput } from './lnd/lnrpc/Channel.js';
export { Invoice__Output } from './lnd/lnrpc/Invoice.js';

export type LndConfig = {
    socket: string;
    cert: string;
    macaroon: string;
};

export function createLndService(config: LndConfig): LndService {
    return new LndService(createLightningGrpcClient(config), createInvoicesGrpcClient(config));
}

function createLightningGrpcClient(config: LndConfig): LightningClient {
    const packageDefinition = loadSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'lnd/lightning.proto'), {
        enums: String,
    });
    const proto = loadPackageDefinition(packageDefinition) as unknown as LndGrpcType;
    const sslCreds = credentials.createSsl(Buffer.from(config.cert, 'base64'));
    const macaroonCreds = credentials.createFromMetadataGenerator((args, callback) => {
        const metadata = new Metadata();
        metadata.add('macaroon', Buffer.from(config.macaroon, 'base64').toString('hex'));
        callback(null, metadata);
    });
    const combinedCreds = credentials.combineChannelCredentials(sslCreds, macaroonCreds);
    return new proto.lnrpc.Lightning(config.socket, combinedCreds);
}

function createInvoicesGrpcClient(config: LndConfig): InvoicesClient {
    const pd = loadSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'lnd/invoices.proto'), {
        enums: String,
    });
    const grpcType = loadPackageDefinition(pd) as unknown as InvoicesGrpcType;
    const sslCreds = credentials.createSsl(Buffer.from(config.cert, 'base64'));
    const macaroonCreds = credentials.createFromMetadataGenerator((_, callback) => {
        const metadata = new Metadata();
        metadata.add('macaroon', Buffer.from(config.macaroon, 'base64').toString('hex'));
        callback(null, metadata);
    });
    return new grpcType.invoicesrpc.Invoices(config.socket, credentials.combineChannelCredentials(sslCreds, macaroonCreds));
}