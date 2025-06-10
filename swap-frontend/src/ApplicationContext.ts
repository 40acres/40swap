import { FrontendConfiguration, frontendConfigurationSchema } from '@40swap/shared';
import { LocalSwapStorageService } from './LocalSwapStorageService.js';

export class ApplicationContext {
    private _config?: Promise<FrontendConfiguration>;
    private _localSwapStorageService?: LocalSwapStorageService;

    get config(): Promise<FrontendConfiguration> {
        if (this._config == null) {
            this._config = fetch('/api/configuration')
                .then(response => {
                    if (response.status >= 300) {
                        return Promise.reject(new Error('error fetching configuration'));
                    }
                    return response.json();
                })
                .then(value => frontendConfigurationSchema.parse(value));
        }
        return this._config;
    }

    get localSwapStorageService(): LocalSwapStorageService {
        if (this._localSwapStorageService == null) {
            this._localSwapStorageService = new LocalSwapStorageService();
        }
        return this._localSwapStorageService;
    }
}

export const applicationContext = new ApplicationContext();