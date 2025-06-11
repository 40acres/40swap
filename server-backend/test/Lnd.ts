import { LightningClient } from '../src/lnd/lnrpc/Lightning.js';
import { StartedGenericContainer } from 'testcontainers/build/generic-container/started-generic-container.js';
import { GetInfoResponse } from '../src/lnd/lnrpc/GetInfoResponse.js';
import { ChannelPoint } from '../src/lnd/lnrpc/ChannelPoint.js';
import { CloseStatusUpdate } from '../src/lnd/lnrpc/CloseStatusUpdate.js';
import { AddInvoiceResponse } from '../src/lnd/lnrpc/AddInvoiceResponse.js';
import { ChannelGraph } from '../src/lnd/lnrpc/ChannelGraph.js';
import { Invoice } from '../src/lnd/lnrpc/Invoice.js';
import Decimal from 'decimal.js';
import { loadSync } from '@grpc/proto-loader';
import { credentials, loadPackageDefinition, Metadata } from '@grpc/grpc-js';
import { ProtoGrpcType as LndGrpcType } from '../src/lnd/lightning.js';

export class Lnd {
    public uri = '';
    public address = '';
    public pubkey = '';

    private constructor(
        private client: LightningClient,
        private container: StartedGenericContainer,
        public cert: string,
        public macaroon: string,
    ) {}

    public static async fromContainer(container: StartedGenericContainer): Promise<Lnd> {
        const cert = (await container.exec('base64 -w0 /root/.lnd/tls.cert')).stdout;
        const macaroon = (await container.exec('base64 -w0 /root/.lnd/data/chain/bitcoin/regtest/admin.macaroon')).stdout;
        const client = await Lnd.createClient(container);
        const obj = new Lnd(client, container, cert, macaroon);
        const info = await obj.getInfo();
        obj.pubkey = info.identityPubkey ?? 'unkown';
        obj.uri = info.uris?.[0] ?? 'unknown';
        obj.address = await obj.newAddress();
        return obj;
    }

    private static async createClient(container: StartedGenericContainer): Promise<LightningClient> {
        const socket = `${container.getHost()}:${container.getMappedPort(10009)}`;
        const cert = (await container.exec('base64 -w0 /root/.lnd/tls.cert')).stdout;
        const macaroon = (await container.exec('base64 -w0 /root/.lnd/data/chain/bitcoin/regtest/admin.macaroon')).stdout;

        const pd = loadSync('./src/lnd/lightning.proto', {
            enums: String,
        });
        const grpcType = loadPackageDefinition(pd) as unknown as LndGrpcType;
        const sslCreds = credentials.createSsl(Buffer.from(cert, 'base64'), null, null, {
            checkServerIdentity: () => {
                return undefined;
            },
        });
        const macaroonCreds = credentials.createFromMetadataGenerator((_, callback) => {
            const metadata = new Metadata();
            metadata.add('macaroon', Buffer.from(macaroon, 'base64').toString('hex'));
            callback(null, metadata);
        });
        return new grpcType.lnrpc.Lightning(socket, credentials.combineChannelCredentials(sslCreds, macaroonCreds));
    }

    async getInfo(): Promise<GetInfoResponse> {
        return new Promise((resolve, reject) => {
            this.client.getInfo({}, (err, info) => {
                if (err != null || info == null) {
                    reject(err);
                } else {
                    resolve(info);
                }
            });
        });
    }

    async newAddress(): Promise<string> {
        return new Promise((resolve, reject) => {
            this.client.newAddress(
                {
                    type: 'WITNESS_PUBKEY_HASH',
                },
                (err, value) => {
                    if (err != null || value == null) {
                        reject(err);
                    } else {
                        resolve(value.address);
                    }
                },
            );
        });
    }

    async connect(uri: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const [pubkey, host] = uri.split('@');
            this.client.connectPeer(
                {
                    addr: {
                        pubkey,
                        host,
                    },
                },
                (err, value) => {
                    if (err != null || value == null) {
                        reject(err);
                    } else {
                        resolve();
                    }
                },
            );
        });
    }

    async openChannel(pubkey: string, amount: number): Promise<ChannelPoint> {
        return new Promise((resolve, reject) => {
            this.client.openChannelSync(
                {
                    nodePubkey: Buffer.from(pubkey, 'hex'),
                    localFundingAmount: new Decimal(amount).mul(1e8).toDecimalPlaces(8).toNumber(),
                    commitmentType: 'STATIC_REMOTE_KEY',
                },
                (err, value) => {
                    if (err != null || value == null) {
                        reject(err);
                    } else {
                        resolve(value);
                    }
                },
            );
        });
    }

    async closeChannel(channelPoint: ChannelPoint, force: boolean = false): Promise<void> {
        return new Promise((resolve, reject) => {
            const call = this.client.closeChannel({
                channelPoint: channelPoint,
                force: force,
            });
            call.on('data', async (update: CloseStatusUpdate) => {
                if (update.closePending != null) {
                    resolve();
                    call.cancel();
                }
            });
            call.on('error', (err) => {
                reject(err);
            });
        });
    }

    async createInvoice(amount: number): Promise<AddInvoiceResponse> {
        return new Promise((resolve, reject) => {
            this.client.addInvoice(
                {
                    value: new Decimal(amount).mul(1e8).toDecimalPlaces(8).toNumber(),
                },
                (err, value) => {
                    if (err != null || value == null) {
                        reject(err);
                    } else {
                        resolve(value);
                    }
                },
            );
        });
    }

    async describeGraph(): Promise<ChannelGraph> {
        return new Promise((resolve, reject) => {
            this.client.describeGraph({}, (err, value) => {
                if (err != null || value == null) {
                    reject(err);
                } else {
                    resolve(value);
                }
            });
        });
    }

    async lookupInvoice(rHash: Buffer): Promise<Invoice> {
        return new Promise((resolve, reject) => {
            this.client.lookupInvoice({ rHash }, (err, value) => {
                if (err != null || value == null) {
                    reject(err);
                } else {
                    resolve(value);
                }
            });
        });
    }

    async sendPayment(invoice: string): Promise<unknown> {
        return new Promise((resolve, reject) => {
            this.client.sendPaymentSync({ paymentRequest: invoice }, (err, value) => {
                if (err != null || value == null) {
                    reject(err);
                } else {
                    resolve(value);
                }
            });
        });
    }
}
