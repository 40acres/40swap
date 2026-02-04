import { Controller, Get, Logger } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ChannelsService } from './ChannelsService.js';
import { ChannelInfo } from './LndService.js';

@ApiTags('channels')
@Controller('channels')
export class ChannelsController {
    private readonly logger = new Logger(ChannelsController.name);

    constructor(private readonly channelsService: ChannelsService) {}

    @Get()
    @ApiOperation({ summary: 'List all Lightning channels' })
    @ApiResponse({ status: 200, description: 'List of all channels with their balances' })
    async listChannels(): Promise<ChannelInfo[]> {
        this.logger.log('GET /channels');
        return this.channelsService.getAllChannels();
    }
}
