import { Inject, Injectable, Logger } from '@nestjs/common';
import { LightningClient } from './lnd/lnrpc/Lightning.js';
import { InvoicesClient } from './lnd/invoicesrpc/Invoices.js';
import { Invoice__Output } from './lnd/lnrpc/Invoice.js';
import { Channel__Output } from './lnd/lnrpc/Channel.js';

@Injectable()
export class LndService {
    private readonly logger = new Logger(LndService.name);

    constructor(
        @Inject('lnd-lightning') private lightning: LightningClient,
        @Inject('lnd-invoices') private invoices: InvoicesClient,
    ) {}

    async sendPayment(invoice: string, cltvLimit: number): Promise<Buffer> {
        this.logger.debug(`paying invoice ${invoice} with cltvLimit=${cltvLimit}`);
        return new Promise((resolve, reject) => {
            this.lightning.sendPaymentSync(
                {
                    paymentRequest: invoice,
                    cltvLimit,
                    finalCltvDelta: 20,
                },
                (err, value) => {
                    if (err) {
                        this.logger.debug(`error paying invoice ${err}`);
                        reject(err);
                    } else if (value?.paymentPreimage != null) {
                        this.logger.debug(`payment success, preimage ${value?.paymentPreimage.toString('hex')}`);
                        resolve(value.paymentPreimage!);
                    } else {
                        this.logger.debug(`error paying invoice ${value?.paymentError}`);
                        reject(new Error(`error paying invoice ${value?.paymentError}`));
                    }
                },
            );
        });
    }

    getNewAddress(): Promise<string> {
        return new Promise((resolve, reject) => {
            this.lightning.newAddress(
                {
                    type: 'WITNESS_PUBKEY_HASH',
                },
                (err, value) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(value!.address);
                    }
                },
            );
        });
    }

    async addHodlInvoice({ hash, amount, expiry, cltvExpiry }: { hash: Buffer; amount: number; expiry: number; cltvExpiry: number }): Promise<string> {
        return new Promise((resolve, reject) => {
            this.invoices.addHoldInvoice(
                {
                    hash,
                    value: amount,
                    expiry,
                    cltvExpiry,
                },
                (err, value) => {
                    if (err != null) {
                        reject(err);
                    } else {
                        resolve(value!.paymentRequest);
                    }
                },
            );
        });
    }

    async lookUpInvoice(hash: Buffer): Promise<Invoice__Output> {
        return new Promise((resolve, reject) => {
            this.invoices.lookupInvoiceV2(
                {
                    invoiceRef: 'paymentHash',
                    paymentHash: hash,
                },
                (err, value) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(value!);
                    }
                },
            );
        });
    }

    async settleInvoice(preimage: Buffer): Promise<void> {
        return new Promise((resolve, reject) => {
            this.invoices.settleInvoice({ preimage }, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    async cancelInvoice(paymentHash: Buffer): Promise<void> {
        return new Promise((resolve, reject) => {
            this.invoices.cancelInvoice({ paymentHash }, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    async sendCoinsOnChain(addr: string, amount: number): Promise<string> {
        return new Promise((resolve, reject) => {
            this.lightning.sendCoins({ amount, addr, targetConf: 2 }, (err, value) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(value!.txid);
                }
            });
        });
    }

    async getChannelInfo(): Promise<Channel__Output[]> {
        return new Promise((resolve, reject) => {
            this.lightning.listChannels({ peerAliasLookup: true }, (err, value) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(value!.channels);
                }
            });
        });
    }
}
