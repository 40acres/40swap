import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import fetch from 'node-fetch';
import { z } from 'zod';
import { Transaction } from 'bitcoinjs-lib';
import { URLSearchParams } from 'url';
import { ConfigService } from '@nestjs/config';
import { clearTimeout } from 'timers';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, EntityManager } from 'typeorm';
import { FourtySwapConfiguration } from './configuration.js';
import { ApplicationState } from './entities/ApplicationState.js';

const nbxplorerBalanceSchema = z.object({
    unconfirmed: z.number(),
    confirmed: z.number().gte(0),
    total: z.number().gte(0),
    immature: z.number().gte(0),
    available: z.number().gte(0),
});
export type NBXplorerBalance = z.infer<typeof nbxplorerBalanceSchema>;

const nbxplorerAddressSchema = z.object({
    trackedSource: z.string(),
    feature: z.string(),
    derivationStrategy: z.string(),
    keyPath: z.string(),
    scriptPubKey: z.string(),
    address: z.string(),
});
export type NBXplorerAddress = z.infer<typeof nbxplorerAddressSchema>;

const nbxplorerUtxoListSchema = z.object({
    spentOutpoints: z.string().array(),
    utxOs: z.array(z.object({
        feature: z.string(),
        outpoint: z.string(),
        index: z.number(),
        transactionHash: z.string(),
        scriptPubKey: z.string(),
        address: z.string().nullish(),
        value: z.number().positive(),
        keyPath: z.string(),
        timestamp: z.number().positive(),
        confirmations: z.number().gte(0),
    })),
});
const nbxplorerUtxosResponseSchema = z.object({
    trackedSource: z.string(),
    derivationStrategy: z.string(),
    currentHeight: z.number(),
    unconfirmed: nbxplorerUtxoListSchema,
    confirmed: nbxplorerUtxoListSchema,
});
export type NBXplorerUtxosResponse = z.infer<typeof nbxplorerUtxosResponseSchema>;

const nbxplorerCreatePsbtResponseSchema = z.object({
    psbt: z.string().min(20),
    changeAddress: z.string().min(5).nullish(),
});
export type NBXplorerCreatePsbtResponse = z.infer<typeof nbxplorerCreatePsbtResponseSchema>;

const nbxplorerTransactionSchema = z.object({
    confirmations: z.number().int(),
    blockId: z.string().nullish(),
    transactionHash: z.string(),
    transaction: z.string(),
    height: z.number().int().nullish(),
    timestamp: z.number().int(),
    replacedBy: z.string().nullish(),
});
export type NBXplorerTransaction = z.infer<typeof nbxplorerTransactionSchema>;

const nbxplorerWalletTransactionSchema = nbxplorerTransactionSchema
    .omit({ transactionHash: true })
    .extend({
        transactionId: z.string(),
        outputs: z.object({
            keyPath: z.string(),
            scriptPubKey: z.string(),
            index: z.number().int(),
            value: z.number().int(),
        }).array(),
        balanceChange: z.number().int(),
    });

const nbxplorerWalletTransactionsResponseSchema = z.object({
    height: z.number(),
    confirmedTransactions: z.object({
        transactions: nbxplorerWalletTransactionSchema.array(),
    }),
    unconfirmedTransactions: z.object({
        transactions: nbxplorerWalletTransactionSchema.array(),
    }),
    replacedTransactions: z.object({
        transactions: nbxplorerWalletTransactionSchema.array(),
    }),
});
export type NBXplorerWalletTransactions = z.infer<typeof nbxplorerWalletTransactionsResponseSchema>;

const nbxplorerFeeRateResponseSchema = z.object({
    feeRate: z.number().positive(),
    blockCount: z.number().int().positive(),
});

const nbxplorerBaseEvent = z.object({
    eventId: z.number().int().positive(),
    type: z.string(),
    data: z.object({}),
});
const nbxplorerTransactionEvent = nbxplorerBaseEvent.extend({
    type: z.literal('newtransaction'),
    data: z.object({
        blockId: z.string().nullish(),
        trackedSource: z.string(),
        transactionData: nbxplorerTransactionSchema,
        outputs: z.object({
            keyPath: z.string().optional(),
            scriptPubKey: z.string(),
            index: z.number().int(),
            value: z.number().int(),
            address: z.string(),
        }).array(),
    }),
});
const nbxplorerBlockEvent = nbxplorerBaseEvent.extend({
    type: z.literal('newblock'),
    data: z.object({
        height: z.number().int().positive(),
        hash: z.string().min(1),
    }),
});
const nbxplorerEvent = z.discriminatedUnion('type', [nbxplorerBlockEvent, nbxplorerTransactionEvent]);
export type NBXplorerBlockEvent = z.infer<typeof nbxplorerBlockEvent>;
export type NBXplorerNewTransactionEvent = z.infer<typeof nbxplorerTransactionEvent>;
export type NBXplorerEvent = z.infer<typeof nbxplorerEvent>;

type CreatePsbtParams = {
    xpub: string;
    rebasePath: string;
    masterFingerprint: string,
    feeRate: number,
} & ({
    inputTxId: string
    inputTxVout: number,
} | {
    destinationAddress: string;
    amount: number,
});

interface NBXplorerCreatePsbtRequest {
    includeGlobalXPub: boolean,
    minConfirmations?: number,
    destinations: {
        destination: string,
        amount: number,
    }[],
    feePreference: {
        explicitFeeRate?: number,
        explicitFee?: number,
        blockTarget?: number,
        fallbackFeeRate?: number,
    },
    rebaseKeyPaths?: [{
        accountKey: string,
        accountKeyPath: string,
    }];
    includeOnlyOutpoints?: string[],
}

const STATE_KEY = 'NBXplorer.lastEventId';

@Injectable()
export class NbxplorerService implements OnApplicationBootstrap, OnApplicationShutdown {

    private readonly logger = new Logger(NbxplorerService.name);
    private readonly config: FourtySwapConfiguration['nbxplorer'];
    private eventProcessingPromise?: Promise<unknown>;
    private shutdownRequested = false;

    constructor(
        config: ConfigService<FourtySwapConfiguration>,
        private dataSource: DataSource,
        private eventEmitter: EventEmitter2,
    ) {
        this.config = config.getOrThrow('nbxplorer', { infer: true });
    }

    async getBalance(xpub: string): Promise<NBXplorerBalance> {
        const response = await (await fetch(`${this.config.baseUrl}/derivations/${xpub}/balance`)).json();
        return nbxplorerBalanceSchema.parse(response);
    }

    async track(xpub: string): Promise<void> {
        const response = await fetch(`${this.config.baseUrl}/derivations/${xpub}`, { method: 'POST' });
        if (response.status >= 300) {
            throw new Error('nbxplorer threw an error when tracking xpub');
        }
    }

    async trackAddress(address: string): Promise<void> {
        const response = await fetch(`${this.config.baseUrl}/addresses/${address}`, { method: 'POST' });
        if (response.status >= 300) {
            throw new Error('nbxplorer threw an error when tracking xpub');
        }
    }

    async getUnusedAddress(xpub: string, opts?: {
        change?: boolean,
        reserve?: boolean
    }): Promise<NBXplorerAddress> {
        const change = opts?.change ?? false;
        const reserve = opts?.reserve ?? false;
        const params = new URLSearchParams({
            feature: change ? 'Change' : 'Deposit',
            reserve: reserve.toString(),
        });
        const response = await (await fetch(`${this.config.baseUrl}/derivations/${xpub}/addresses/unused?${params}`)).json();
        return nbxplorerAddressSchema.parse(response);
    }
    async getUTXOs(xpub: string): Promise<NBXplorerUtxosResponse> {
        const response = await (await fetch(`${this.config.baseUrl}/derivations/${xpub}/utxos`)).json();
        return nbxplorerUtxosResponseSchema.parse(response);
    }

    async broadcastTx(tx: Transaction): Promise<void> {
        const response = await fetch(`${this.config.baseUrl}/transactions`, {
            method: 'POST',
            body: tx.toBuffer(),
        });
        // TODO apparently nbxplorer does not fail if the tx is invalid, it just logs an error
        // we should probably fix it in nbxplorer itself
        if (response.status >= 300) {
            throw new Error('nbxplorer threw an when broadcasting a transaction');
        }
    }

    async getTx(id: string): Promise<NBXplorerTransaction|null> {
        const response = await fetch(`${this.config.baseUrl}/transactions/${id}`, {
            method: 'GET',
        });
        if (response.status === 404) {
            return null;
        }
        if (response.status >= 300) {
            throw new Error(`nbxplorer threw an error when fetching a transaction: ${id}`);
        }
        return nbxplorerTransactionSchema.parse(await response.json());
    }

    async getFeeRate(blockCount: number): Promise<number> {
        const response = await fetch(`${this.config.baseUrl}/fees/${blockCount}`, {
            method: 'GET',
        });
        if (response.status === 400) {
            this.logger.warn('Fee rate calculation is unavailable, using default one');
            return this.config.fallbackFeeRate;
        }
        if (response.status >= 300) {
            throw new Error('nbxplorer threw an when fetching the fee rate');
        }
        return nbxplorerFeeRateResponseSchema.parse(await response.json()).feeRate;
    }

    async getWalletTransactions(xpub: string): Promise<NBXplorerWalletTransactions> {
        const response = await fetch(`${this.config.baseUrl}/derivations/${xpub}/transactions`, {
            method: 'GET',
        });
        if (response.status >= 300) {
            throw new Error('nbxplorer threw an when fetching a transaction');
        }
        return nbxplorerWalletTransactionsResponseSchema.parse(await response.json());
    }


    private abortController?: AbortController;


    async processBitcoinEvents(): Promise<void> {
        while (!this.shutdownRequested) {
            const lastEventId = await this.getLastEventId();
            const events = await this.getEvents({ lastEventId });
            for (const event of events) {
                if (this.shutdownRequested) {
                    break;
                }
                await this.dataSource.transaction(async dbTx => {
                    await this.saveLastEventId(event.eventId, dbTx);
                    if (event.type === 'newblock' || event.type === 'newtransaction') {
                        await this.eventEmitter.emitAsync(`nbxplorer.${event.type}`, event);
                    }
                });
            }
        }
        this.logger.log('Bitcoin event listener stopped');
    }

    private lastEventId = 0;

    private async getLastEventId(): Promise<number> {
        const applicationStateRepo = this.dataSource.getRepository(ApplicationState);
        const lastEventId = (await applicationStateRepo.findOne({ where: { key: STATE_KEY } }))?.value as number ?? 0;
        if (lastEventId === 0) {
            await applicationStateRepo.save({ key: STATE_KEY, value: 0 });
        }
        return lastEventId;
    }

    private async saveLastEventId(eventId: number, dbTx: EntityManager): Promise<void> {
        await dbTx.getRepository(ApplicationState).update({ key: STATE_KEY }, { value: eventId });
    }

    private async getEvents(params: { lastEventId: number }): Promise<NBXplorerEvent[]> {
        this.logger.debug(`Fetching blockchain events from nbxplorer. LastEventId=${params.lastEventId}`);
        this.abortController = new AbortController();
        const timeout = setTimeout(() => this.abortController?.abort(), this.config.longPollingTimeoutSeconds * 1000);
        try {
            const response = await fetch(
                `${this.config.baseUrl}/events?` + new URLSearchParams({
                    lastEventId: params.lastEventId.toFixed(0),
                    limit: '200',
                    longPolling: 'true',
                }),
                {
                    // @ts-ignore
                    signal: this.abortController.signal,
                });
            this.abortController = undefined;
            clearTimeout(timeout);
            return nbxplorerEvent.array().parse(await response.json());
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
            if (e.type === 'aborted') {
                return [];
            }
            throw e;
        }
    }

    async createPSBT(params: CreatePsbtParams): Promise<NBXplorerCreatePsbtResponse> {
        const { xpub, masterFingerprint, rebasePath } = params;
        let extraParams: Partial<NBXplorerCreatePsbtRequest> = {};
        if ('inputTxId' in params) {
            extraParams = {
                includeOnlyOutpoints: [`${params.inputTxId}-${params.inputTxVout}`],
            };
        } else {
            extraParams = {
                destinations: [{
                    destination: params.destinationAddress,
                    amount: params.amount,
                }],
            };
        }
        const requestBody: NBXplorerCreatePsbtRequest = {
            includeGlobalXPub: true,
            destinations: [],
            feePreference: {
                explicitFeeRate: params.feeRate,
                fallbackFeeRate: this.config.fallbackFeeRate,
            },
            rebaseKeyPaths: [{
                accountKey: xpub,
                accountKeyPath: rebasePath.replace('m', masterFingerprint),
            }],
            ...extraParams,
        };
        const response = await fetch(`${this.config.baseUrl}/derivations/${xpub}/psbt/create`, {
            method: 'POST',
            body: JSON.stringify(requestBody),
            headers: {
                'Content-Type': 'application/json',
            },
        });
        if (response.status >= 300) {
            throw new Error(`nbxplorer threw an error when creating PSBT.
                ${await response.text()}`
            );
        }
        return nbxplorerCreatePsbtResponseSchema.parse(await response.json());
    }

    onApplicationBootstrap(): void {
        this.eventProcessingPromise = this.processBitcoinEvents();
    }

    onApplicationShutdown(): Promise<unknown> {
        this.shutdownRequested = true;
        if (this.abortController != null) {
            this.logger.log('Interrupting events long poller');
            this.abortController.abort();
        }
        return this.eventProcessingPromise ?? Promise.resolve();
    }
}
