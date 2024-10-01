import { FrontendConfiguration, frontendConfigurationSchema } from '@40swap/shared';
import { ECPairAPI, ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import { LocalSwapStorageService } from './LocalSwapStorageService.js';

export class ApplicationContext {
    private _config?: Promise<FrontendConfiguration>;
    private _localSwapStorageService?: LocalSwapStorageService;

    get config(): Promise<FrontendConfiguration> {
        if (this._config == null) {
            // eslint-disable-next-line no-async-promise-executor
            this._config = new Promise<FrontendConfiguration>(async (resolve, reject) => {
                const response = await fetch('/api/configuration');
                if (response.status >= 300) {
                    reject(new Error('error fetching configuration'));
                }
                resolve(frontendConfigurationSchema.parse(await response.json()));
            });
        }
        return this._config;
    }

    get ECPair(): ECPairAPI {
        return ECPairFactory(ecc);
    }

    get localSwapStorageService(): LocalSwapStorageService {
        if (this._localSwapStorageService == null) {
            this._localSwapStorageService = new LocalSwapStorageService();
        }
        return this._localSwapStorageService;
    }
}

export const applicationContext = new ApplicationContext();