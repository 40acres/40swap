import { Injectable, Logger } from '@nestjs/common';
import { ChannelOutput, LndService } from '@40swap/crypto-clients';

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
export class ChannelsService {
    private readonly logger = new Logger(ChannelsService.name);

    constructor(private readonly lndService: LndService) {}

    async getAllChannels(): Promise<ChannelInfo[]> {
        this.logger.debug('fetching all channels');
        const channels = await this.lndService.getChannelInfo();
        return channels.map(channelOutputToChannelInfo);
    }

    async getChannelById(channelId: string): Promise<ChannelInfo | undefined> {
        this.logger.debug(`fetching channel ${channelId}`);
        const channels = await this.lndService.getChannelInfo();
        return channels.map(channelOutputToChannelInfo).find((ch) => ch.channelId === channelId);
    }
}

function channelOutputToChannelInfo(channel: ChannelOutput): ChannelInfo {
    return {
        channelId: channel.chanId?.toString() || '',
        capacity: channel.capacity?.toString() || '0',
        localBalance: channel.localBalance?.toString() || '0',
        remoteBalance: channel.remoteBalance?.toString() || '0',
        active: channel.active || false,
        remotePubkey: channel.remotePubkey || '',
        channelPoint: channel.channelPoint || '',
        peerAlias: channel.peerAlias || channel.remotePubkey || '',
    };
}
