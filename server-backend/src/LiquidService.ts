/* eslint-disable @typescript-eslint/no-explicit-any */
import { FourtySwapConfiguration } from './configuration.js';
import { NbxplorerService } from './NbxplorerService.js';
import { Injectable, Logger, Inject, OnApplicationBootstrap, Scope } from '@nestjs/common';
import Decimal from 'decimal.js';
import * as liquid from 'liquidjs-lib';
import { z } from 'zod';

const LiquidConfigurationDetailsSchema = z.object({
    rpcUrl: z.string(),
    rpcAuth: z.object({
        username: z.string(),
        password: z.string(),
    }),
    xpub: z.string(),
});

export type LiquidConfigurationDetails = z.infer<typeof LiquidConfigurationDetailsSchema>;

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

const MempoolInfoSchema = z.object({
    loaded: z.boolean(),
    size: z.number(),
    bytes: z.number(),
    usage: z.number(),
    total_fee: z.number(),
    maxmempool: z.number(),
    mempoolminfee: z.number(),
    minrelaytxfee: z.number(),
    unbroadcastcount: z.number(),
});

const WalletProcessPsbtResultSchema = z.object({
    complete: z.boolean(),
    psbt: z.string(),
});

export type WalletProcessPsbtResult = z.infer<typeof WalletProcessPsbtResultSchema>;

const FinalizedPsbtResultSchema = z.object({
    hex: z.string(),
    complete: z.boolean(),
});

export type FinalizedPsbtResult = z.infer<typeof FinalizedPsbtResultSchema>;

export type RPCUtxo = z.infer<typeof RPCUtxoSchema>;
export type MempoolInfo = z.infer<typeof MempoolInfoSchema>;

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
        this.configurationDetails = LiquidConfigurationDetailsSchema.parse({
            rpcUrl: this.rpcUrl,
            rpcAuth: this.rpcAuth,
            xpub: this.xpub,
        });
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

    /**
     * Gets unspent UTXOs with a minimum total amount in BTC/L-BTC format (satoshis/1e8).
     * For example, 0.1 BTC would be passed as 0.1, not 10000000.
     * @param amount Total amount in BTC/L-BTC format (satoshis/1e8). Pass null to get all available UTXOs.
     * @returns An array of unspent UTXOs.
     */
    async getUnspentUtxos(amount: Decimal | null = null): Promise<RPCUtxo[]> {
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

    /**
     * Gets confirmed UTXOs with a minimum total amount.
     * @param amount Total amount in BTC/L-BTC format (satoshis/1e8).
     * @returns An object with the unspent UTXOs and the total input value (total sum of all UTXOs values).
     */
    async getConfirmedUtxosAndInputValueForAmount(amount: Decimal): Promise<{ 
        utxos: RPCUtxo[], 
        totalInputValue: number,
    }> {
        let totalInputValue = 0;
        const confirmedUtxos = await this.getUnspentUtxos(amount);
        if (confirmedUtxos.length === 0) {
            throw new Error('No confirmed UTXOs found');
        }
        totalInputValue = confirmedUtxos.reduce((sum, utxo) => sum + utxo.amount * 1e8, 0);
        if (new Decimal(totalInputValue).lt(amount)) {
            throw new Error(`Insufficient funds, required ${amount} but only ${totalInputValue} available`);
        }
        return { utxos: confirmedUtxos, totalInputValue };
    }

    async getNewAddress(): Promise<string> {
        const address = await this.callRPC('getnewaddress');
        return z.string().parse(address);
    }

    async getUtxoTx(utxo: RPCUtxo, xpub: string): Promise<liquid.Transaction> {
        const hexTx = await this.callRPC('getrawtransaction', [utxo.txid]);
        return liquid.Transaction.fromBuffer(Buffer.from(z.string().parse(hexTx), 'hex'));
    }

    async getMempoolInfo(): Promise<MempoolInfo> {
        const mempoolInfo = await this.callRPC('getmempoolinfo');
        return MempoolInfoSchema.parse(mempoolInfo);
    }

    async signPset(psetBase64: string): Promise<liquid.Pset> {
        const result = WalletProcessPsbtResultSchema.parse(
            await this.callRPC('walletprocesspsbt', [psetBase64, true, 'ALL'])
        );
        if (!result.complete) {
            throw new Error('Could not process PSET');
        }
        const processedPset = liquid.Pset.fromBase64(result.psbt);
        if (!processedPset.isComplete()) {
            throw new Error('PSET is not complete');
        }
        return processedPset;
    }

    async getFinalizedPsetHex(pset: string): Promise<string> {
        const response = FinalizedPsbtResultSchema.parse(
            await this.callRPC('finalizepsbt', [pset])
        );
        if (!response.complete) {
            throw new Error('PSET is not complete');
        }
        return response.hex;
    }
}
