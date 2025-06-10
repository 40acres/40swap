import { FortySwapClient, FrontendConfiguration, frontendConfigurationSchema } from '@40swap/shared';
import { ECPairAPI, ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import { LocalSwapStorageService } from './LocalSwapStorageService.js';
import { SwapInService } from './SwapInService.js';
import { SwapOutService } from './SwapOutService.js';

export class ApplicationContext {
    private _config?: Promise<FrontendConfiguration>;
    private _localSwapStorageService?: LocalSwapStorageService;
    private _swapInService?: SwapInService;
    private _swapOutService?: SwapOutService;
    private _fortySwapClient?: FortySwapClient;
    private _ECPair?: ECPairAPI;

    get config(): Promise<FrontendConfiguration> {
        if (this._config == null) {
            this._config = fetch('/api/configuration')
                .then((response) => {
                    if (response.status >= 300) {
                        return Promise.reject(new Error('error fetching configuration'));
                    }
                    return response.json();
                })
                .then((value) => frontendConfigurationSchema.parse(value));
        }
        return this._config;
    }

    get ECPair(): ECPairAPI {
        if (this._ECPair == null) {
            this._ECPair = ECPairFactory(ecc);
        }
        return this._ECPair;
    }

    get localSwapStorageService(): LocalSwapStorageService {
        if (this._localSwapStorageService == null) {
            this._localSwapStorageService = new LocalSwapStorageService();
        }
        return this._localSwapStorageService;
    }

    get swapInService(): SwapInService {
        if (this._swapInService == null) {
            this._swapInService = new SwapInService(this.config, this.localSwapStorageService, this.ECPair, this.fortySwapClient);
        }
        return this._swapInService;
    }

    get swapOutService(): SwapOutService {
        if (this._swapOutService == null) {
            this._swapOutService = new SwapOutService(this.config, this.localSwapStorageService, this.ECPair, this.fortySwapClient);
        }
        return this._swapOutService;
    }

    get fortySwapClient(): FortySwapClient {
        if (this._fortySwapClient == null) {
            this._fortySwapClient = new FortySwapClient('');
        }
        return this._fortySwapClient;
    }
}

export const applicationContext = new ApplicationContext();
