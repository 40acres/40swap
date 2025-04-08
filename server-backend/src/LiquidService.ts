/* eslint-disable @typescript-eslint/no-explicit-any */
import { FourtySwapConfiguration } from './configuration.js';
import { NbxplorerService} from './NbxplorerService.js';
import { Injectable, Logger, Inject, OnApplicationBootstrap, Scope } from '@nestjs/common';
import { z } from 'zod';

export class LiquidConfigurationDetails {
    readonly rpcUrl!: string;
    readonly rpcAuth!: {username: string, password: string};
    public xpub!: string;
}

const RPCUtxoSchema = z.object({
    txid: z.string(),
    vout: z.number(),
    address: z.string(),
    label: z.string(),
    scriptPubKey: z.string(),
    amount: z.number(),
    asset: z.string(),
    amountblinder: z.string(),
    assetblinder: z.string(),
    confirmations: z.number(),
    spendable: z.boolean(),
    solvable: z.boolean(),
    desc: z.string(),
    safe: z.boolean(),
});

export type RPCUtxo = z.infer<typeof RPCUtxoSchema>;

@Injectable({ scope: Scope.DEFAULT })
export class LiquidService implements OnApplicationBootstrap  {

    configurationDetails: LiquidConfigurationDetails;
    public readonly xpub: string;
    private readonly logger = new Logger(LiquidService.name);
    private readonly rpcUrl: string;
    private readonly rpcAuth: {username: string, password: string};
    
    constructor(
        private nbxplorer: NbxplorerService,
        @Inject('ELEMENTS_CONFIG') private elementsConfig: FourtySwapConfiguration['elements'],
    ) {
        this.xpub = this.elementsConfig.xpub;
        this.rpcUrl = this.elementsConfig.rpcUrl;
        this.rpcAuth = {
            username: this.elementsConfig.rpcUsername,
            password: this.elementsConfig.rpcPassword,
        };
        this.configurationDetails = {
            rpcUrl: this.rpcUrl,
            rpcAuth: this.rpcAuth,
            xpub: this.xpub,
        };
    }
    
    async onApplicationBootstrap(): Promise<void> {
        this.logger.debug('Initializing LiquidService xpub');
        try {
            await this.nbxplorer.track(this.xpub, 'lbtc');
            this.logger.log('LiquidService initialized successfully');
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Failed to initialize Liquid xpub: ${errorMessage}`);
        }
    }

    async callRPC(method: string, params: unknown[] = []): Promise<unknown> {
        try {
            const authString = Buffer.from(`${this.rpcAuth.username}:${this.rpcAuth.password}`).toString('base64');
            const response = await fetch(this.rpcUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${authString}`,
                },
                body: JSON.stringify({
                    jsonrpc: '1.0',
                    id: '40swap',
                    method,
                    params,
                }),
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            
            const data = await response.json() as { result: unknown };
            return data.result;
        } catch (error) {
            this.logger.error(`Error calling Elements RPC ${method}: ${(error as Error).message}`);
            throw error;
        }
    }

    async getUnspentUtxos(amount: number | null = null): Promise<RPCUtxo[]> {
        // Params: [minconf, maxconf, addresses, include_unsafe, query_options]
        // more info: https://elementsproject.org/en/doc/23.2.1/rpc/wallet/listunspent
        let utxoResponse: unknown;
        if (amount === null) {
            utxoResponse = await this.callRPC('listunspent');
        } else {
            utxoResponse = await this.callRPC('listunspent', [1, 9999999, [] , false, { 'minimumSumAmount': amount } ]);
        }
        return RPCUtxoSchema.array().parse(utxoResponse);
    }

    async getConfirmedUtxosAndInputValueForAmount(amount: number): Promise<{ 
        utxos: RPCUtxo[], 
        totalInputValue: number,
    }> {
        let totalInputValue = 0;
        const confirmedUtxos = await this.getUnspentUtxos(amount);
        if (confirmedUtxos.length === 0) {
            throw new Error('No confirmed UTXOs found');
        }
        totalInputValue = confirmedUtxos.reduce((sum, utxo) => sum + utxo.amount * 1e8, 0);
        if (totalInputValue < amount) {
            throw new Error(`Insufficient funds, required ${amount} but only ${totalInputValue} available`);
        }
        return { utxos: confirmedUtxos, totalInputValue };
    }
  
    async signPsbt(psbtBase64: string): Promise<string> {
        return this.callRPC('walletprocesspsbt', [psbtBase64]) as unknown as string;
    }
  
    async getNewAddress(): Promise<string> {
        return this.callRPC('getnewaddress') as unknown as string;
    }
  
    async getWalletInfo(): Promise<string> {
        return this.callRPC('getwalletinfo') as unknown as string;
    }
}
