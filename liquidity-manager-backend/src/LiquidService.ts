import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LiquidityManagerConfiguration } from './configuration.js';

@Injectable()
export class LiquidService {
    private readonly logger = new Logger(LiquidService.name);
    private readonly rpcUrl: string;
    private readonly rpcAuth: { username: string; password: string; wallet: string };

    constructor(private readonly configService: ConfigService<LiquidityManagerConfiguration>) {
        const config = this.configService.getOrThrow('elements', { infer: true });
        this.rpcUrl = config.rpcUrl;
        this.rpcAuth = {
            username: config.rpcUsername,
            password: config.rpcPassword,
            wallet: config.rpcWallet,
        };
    }

    async getNewAddress(): Promise<string> {
        this.logger.debug('Getting new Liquid address');
        const address = await this.callRPC('getnewaddress');
        if (typeof address !== 'string') {
            throw new Error('Invalid response from getnewaddress');
        }
        return address;
    }

    private async callRPC(method: string, params: unknown[] = []): Promise<unknown> {
        try {
            const authString = Buffer.from(`${this.rpcAuth.username}:${this.rpcAuth.password}`).toString('base64');
            const response = await fetch(`${this.rpcUrl}/wallet/${this.rpcAuth.wallet}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Basic ${authString}`,
                },
                body: JSON.stringify({
                    jsonrpc: '1.0',
                    id: 'liquidity-manager',
                    method,
                    params,
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}, ${await response.text()}`);
            }

            const data = (await response.json()) as { result: unknown };
            return data.result;
        } catch (error) {
            this.logger.error(`Error calling Elements RPC ${method}: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
}
