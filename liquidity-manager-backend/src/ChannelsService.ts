import { Injectable, Logger } from '@nestjs/common';
import { LndService } from './LndService.js';
import { ChannelInfo } from './LndService.js';

@Injectable()
export class ChannelsService {
    private readonly logger = new Logger(ChannelsService.name);

    constructor(private readonly lndService: LndService) {}

    async getAllChannels(): Promise<ChannelInfo[]> {
        this.logger.debug('fetching all channels');
        return this.lndService.listChannels();
    }

    async getChannelById(channelId: string): Promise<ChannelInfo | undefined> {
        this.logger.debug(`fetching channel ${channelId}`);
        const channels = await this.lndService.listChannels();
        return channels.find((ch) => ch.channelId === channelId);
    }
}
