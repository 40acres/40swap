import { Inject, Injectable, Logger } from '@nestjs/common';
import { LightningClient } from './lnd/lnrpc/Lightning.js';
import { Channel__Output } from './lnd/lnrpc/Channel.js';

export interface ChannelInfo {
    channelId: string;
    capacity: string;
    localBalance: string;
    remoteBalance: string;
    active: boolean;
    remotePubkey: string;
    channelPoint: string;
    peerAlias: string;
}

@Injectable()
export class LndService {
    private readonly logger = new Logger(LndService.name);

    constructor(@Inject('lnd-lightning') private lightning: LightningClient) {}

    async listChannels(): Promise<ChannelInfo[]> {
        this.logger.debug('listing all channels');
        return new Promise((resolve, reject) => {
            this.lightning.listChannels({ peerAliasLookup: true }, (err, value) => {
                if (err) {
                    this.logger.error(`error listing channels: ${err}`);
                    reject(err);
                } else {
                    const channels = (value?.channels || []).map((channel: Channel__Output) => ({
                        channelId: channel.chanId?.toString() || '',
                        capacity: channel.capacity?.toString() || '0',
                        localBalance: channel.localBalance?.toString() || '0',
                        remoteBalance: channel.remoteBalance?.toString() || '0',
                        active: channel.active || false,
                        remotePubkey: channel.remotePubkey || '',
                        channelPoint: channel.channelPoint || '',
                        peerAlias: channel.peerAlias || channel.remotePubkey || '',
                    }));
                    this.logger.debug(`found ${channels.length} channels`);
                    resolve(channels);
                }
            });
        });
    }

    async sendPayment(invoice: string): Promise<Buffer> {
        this.logger.debug(`paying invoice ${invoice}`);
        return new Promise((resolve, reject) => {
            this.lightning.sendPaymentSync(
                {
                    paymentRequest: invoice,
                },
                (err, value) => {
                    if (err) {
                        this.logger.error(`error paying invoice: ${err}`);
                        reject(err);
                    } else if (value?.paymentPreimage != null) {
                        this.logger.debug(`payment success, preimage ${value.paymentPreimage.toString('hex')}`);
                        resolve(value.paymentPreimage);
                    } else {
                        this.logger.error(`error paying invoice: ${value?.paymentError}`);
                        reject(new Error(`error paying invoice: ${value?.paymentError}`));
                    }
                },
            );
        });
    }
}
