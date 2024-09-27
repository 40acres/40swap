import { Injectable } from '@nestjs/common';
import { Network, networks } from 'bitcoinjs-lib';
import { ConfigService } from '@nestjs/config';
import { FourtySwapConfiguration } from './configuration.js';

export class BitcoinConfigurationDetails {
    readonly network!: Network;
    readonly requiredConfirmations!: number;
    readonly swapLockBlockDelta!: number;
}

@Injectable()
export class BitcoinService {
    readonly configurationDetails: BitcoinConfigurationDetails;
    private config: FourtySwapConfiguration['bitcoin'];

    constructor(config: ConfigService<FourtySwapConfiguration>,) {
        this.config = config.getOrThrow('bitcoin', { infer: true });
        const network = networks[this.config.network];
        this.configurationDetails = {
            network,
            requiredConfirmations: this.config.requiredConfirmations,
            swapLockBlockDelta: this.config.swapLockBlockDelta,
        };
    }
}