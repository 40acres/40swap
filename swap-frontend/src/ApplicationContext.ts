import { FrontendConfiguration, frontendConfigurationSchema } from '@40swap/shared';

export class ApplicationContext {
    private _config?: Promise<FrontendConfiguration>;

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
}

export const applicationContext = new ApplicationContext();