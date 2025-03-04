import { getSwapInResponseSchema, getSwapOutResponseSchema } from '@40swap/shared';
import * as idb from 'idb';
import { DBSchema, IDBPDatabase } from 'idb';
import { SwapType } from './utils.js';
import { z } from 'zod';

const persistedSwapInSchema = getSwapInResponseSchema.extend({
    type: z.literal('in'),
    refundKey: z.string(),
    refundRequestDate: z.string().pipe(z.coerce.date()).optional(),
});
export type PersistedSwapIn = z.infer<typeof persistedSwapInSchema>;

const persistedSwapOutSchema = getSwapOutResponseSchema.extend({
    type: z.literal('out'),
    preImage: z.string(),
    hash: z.string(),
    claimKey: z.string(),
    sweepAddress: z.string(),
    claimRequestDate: z.string().pipe(z.coerce.date()).optional(),
});
export type PersistedSwapOut = z.infer<typeof persistedSwapOutSchema>;

export interface FourtySwapDbSchema extends DBSchema {
    'swap': {
        key: string,
        value: PersistedSwapIn | PersistedSwapOut,
        indexes: {
            'by-created-at': string,
        },
    };
}

export type PersistedSwapKey = Pick<PersistedSwapIn | PersistedSwapOut, 'type' | 'swapId'>;

export class LocalSwapStorageService {

    private db: Promise<IDBPDatabase<FourtySwapDbSchema>>;

    constructor() {
        if (navigator.storage && navigator.storage.persist) {
            try {
                navigator.storage.persist().then(persisted => {
                    if (persisted) {
                        console.log('PERSISTED DATA GRANTED');
                    } else {
                        console.error('PERSISTED DATA DENIED');
                    }
                });
            } catch (error) {
                console.error('PERSISTED DATA ERROR', error);
            }
        }
        this.db = idb.openDB<FourtySwapDbSchema>('40swap', 1, {
            upgrade(db) {
                const store = db.createObjectStore('swap', { keyPath: 'swapId' });
                store.createIndex('by-created-at', 'createdAt', { unique: false });
            },
        });
    }

    async persist(swap: PersistedSwapIn | PersistedSwapOut): Promise<void> {
        await (await this.db).add('swap', swap);
    }

    async update<T extends PersistedSwapIn | PersistedSwapOut>(swap: Partial<T> & PersistedSwapKey): Promise<void> {
        const existing = await this.findById(swap.type, swap.swapId);
        if (existing == null) {
            throw new Error();
        }
        await (await this.db).put('swap', { ...existing, ...swap });
    }

    async findById<T extends SwapType>(type: T, swapId: PersistedSwapIn['swapId']): Promise<(T extends 'in' ? PersistedSwapIn : PersistedSwapOut) | null> {
        const obj = (await (await this.db).get('swap', swapId));
        if (obj != null && obj.type === type) {
            return obj as (T extends 'in' ? PersistedSwapIn : PersistedSwapOut);
        }
        return null;
    }

    async findAllLocally(): Promise<(PersistedSwapIn | PersistedSwapOut)[]> {
        return (await (await this.db).getAllFromIndex('swap', 'by-created-at')).reverse();
    }

    async delete(id: string): Promise<void> {
        return (await this.db).delete('swap', id);
    }

    async createBackup(): Promise<string> {
        return JSON.stringify(await this.findAllLocally(), undefined, 2);
    }

    async restoreBackup(backupData: string): Promise<void> {
        const validator = z.discriminatedUnion('type', [persistedSwapInSchema, persistedSwapOutSchema]).array();
        const data = validator.parse(JSON.parse(backupData));
        for (const item of data) {
            const existing = await this.findById(item.type, item.swapId);
            if (existing != null) {
                console.log(`Not importing swap ${item.type} ${item.swapId} because it exists locally`);
                continue;
            }
            await this.persist(item);
        }
    }

}