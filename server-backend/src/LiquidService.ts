/* eslint-disable @typescript-eslint/no-explicit-any */
import { FourtySwapConfiguration } from './configuration.js';
import { NbxplorerService, NBXplorerUtxo, NBXplorerUtxosResponse } from './NbxplorerService.js';
import { Injectable, Logger, Inject, OnApplicationBootstrap, Scope } from '@nestjs/common';
import axios from 'axios';
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
        this.logger.debug('Starting to initialize LiquidService xpub');
        try {
            await this.nbxplorer.track(this.xpub, 'lbtc');
            this.logger.log('LiquidService xpub initialized successfully');
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Failed to initialize Liquid xpub: ${errorMessage}`);
        }
    }

    async callRPC(method: string, params: any[] = []): Promise<any> {
        try {
            const response = await axios.post(this.rpcUrl, {
                jsonrpc: '1.0',
                id: '40swap',
                method,
                params,
            }, {
                auth: this.rpcAuth,
            });
            return response.data.result;
        } catch (error) {
            this.logger.error(`Error calling Elements RPC ${method}: ${(error as any).message}`);
            throw error;
        }
    }

    async getUtxos(): Promise<NBXplorerUtxosResponse | void> {
        if (!this.xpub) {
            this.logger.error('Attempting to get UTXOs with empty xpub');
            throw new Error('Xpub is not initialized');
        }
        const utxoResponse = await this.nbxplorer.getUTXOs(this.xpub, 'lbtc');
        if (!utxoResponse) {
            throw new Error('No UTXOs returned from NBXplorer');
        }
        return utxoResponse;
    }

    async getConfirmedUtxos(): Promise<NBXplorerUtxo[]> {
        const utxoResponse = await this.getUtxos();
        return utxoResponse?.confirmed.utxOs ?? [];
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
        return this.callRPC('walletprocesspsbt', [psbtBase64]);
    }
  
    async getNewAddress(): Promise<string> {
        return this.callRPC('getnewaddress');
    }
  
    async getWalletInfo(): Promise<any> {
        return this.callRPC('getwalletinfo');
    }
}
