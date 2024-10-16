import { Injectable, Logger } from '@nestjs/common';
import { Network, networks } from 'bitcoinjs-lib';
import { ConfigService } from '@nestjs/config';
import { FourtySwapConfiguration } from './configuration.js';
import { NbxplorerService } from './NbxplorerService.js';
import { MempoolDotSpaceService } from './MempoolDotSpaceService.js';

export class BitcoinConfigurationDetails {
    readonly network!: Network;
    readonly requiredConfirmations!: number;
    readonly swapLockBlockDelta!: number;
}

@Injectable()
export class BitcoinService {
    private readonly logger = new Logger(BitcoinService.name);

    readonly configurationDetails: BitcoinConfigurationDetails;
    private config: FourtySwapConfiguration['bitcoin'];

    constructor(
        config: ConfigService<FourtySwapConfiguration>,
        private nbxplorer: NbxplorerService,
        private mempoolDotSpace: MempoolDotSpaceService,
    ) {
        this.config = config.getOrThrow('bitcoin', { infer: true });
        const network = networks[this.config.network];
        this.configurationDetails = {
            network,
            requiredConfirmations: this.config.requiredConfirmations,
            swapLockBlockDelta: this.config.swapLockBlockDelta,
        };
    }

    async getBlockHeight(): Promise<number> {
        return (await this.nbxplorer.getNetworkStatus()).chainHeight;
    }

    public async getMinerFeeRate(priority: 'high_prio'|'low_prio'): Promise<number> {
        try {
            const feeRates = await this.mempoolDotSpace.getFeeRate();
            switch (priority) {
            case 'high_prio': return feeRates.fastestFee;
            case 'low_prio': return feeRates.halfHourFee;
            }
        } catch (e) {
            this.logger.warn('failed to get miner fee rate from mempool.space. Trying with nbxplorer');
            const confirmationTarget = priority === 'high_prio' ? 3 : 6;
            return await this.nbxplorer.getFeeRate(confirmationTarget);
        }
    }

    public hasEnoughConfirmations(txHeight: number, blockchainHeight: number): boolean {
        return txHeight > 0 && blockchainHeight - txHeight + 1  >= this.configurationDetails.requiredConfirmations;
    }
}