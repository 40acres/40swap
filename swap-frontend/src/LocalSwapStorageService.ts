import { getSwapInResponseSchema, getSwapOutResponseSchema, SwapPersistence, SwapType } from '@40swap/shared';
import * as idb from 'idb';
import { DBSchema, IDBPDatabase } from 'idb';
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

export interface FortySwapDbSchema extends DBSchema {
    'swap': {
        key: string,
        value: PersistedSwapIn | PersistedSwapOut,
        indexes: {
            'by-created-at': string,
        },
    };
}

export class LocalSwapStorageService implements SwapPersistence {

    private db: Promise<IDBPDatabase<FortySwapDbSchema>>;

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
        this.db = idb.openDB<FortySwapDbSchema>('40swap', 2, {
            upgrade(db, oldVersion, newVersion, transaction) {
                const store = db.objectStoreNames.contains('swap')
                    ? transaction.objectStore('swap')
                    : db.createObjectStore('swap', { keyPath: 'swapId' });
        
                if (oldVersion < 1) {
                    store.createIndex('by-created-at', 'createdAt', { unique: false });
                }
        
                if (oldVersion < 2) {
                    const index = store.index('by-created-at');
                    index.getAll().then((swaps: (PersistedSwapIn | PersistedSwapOut)[]) => {
                        for (const swap of swaps) {
                            if (!swap.chain) {
                                swap.chain = 'BITCOIN';
                                store.put(swap);
                            }
                        }
                    }).catch(err => {
                        console.error('Migration failed', err);
                    });
                }
            },
        });
    }

    async persist(swap: PersistedSwapIn | PersistedSwapOut): Promise<void> {
        await (await this.db).add('swap', swap);
    }

    async update<T extends PersistedSwapIn | PersistedSwapOut>(swap: Partial<T> & Pick<PersistedSwapIn, 'swapId'> & { type: SwapType }): Promise<void> {
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
