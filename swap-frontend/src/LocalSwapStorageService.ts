import { GetSwapInResponse, GetSwapOutResponse } from '@40swap/shared';
import * as idb from 'idb';
import { DBSchema, IDBPDatabase } from 'idb';
import { SwapType } from './utils.js';

export type PersistedSwapIn = GetSwapInResponse & {
    type: 'in';
    refundKey: string,
};
export type PersistedSwapOut = GetSwapOutResponse & {
    type: 'out';
    preImage: string,
    hash: string,
    claimKey: string,
    sweepAddress: string,
};

export interface FourtySwapDbSchema extends DBSchema {
    'swap': {
        key: string,
        value: PersistedSwapIn|PersistedSwapOut,
        indexes: {
            'by-created-at': string,
        },
    };
}

export type PersistedSwapKey = Pick<PersistedSwapIn|PersistedSwapOut, 'type'|'swapId'>;

export class LocalSwapStorageService {

    private db: Promise<IDBPDatabase<FourtySwapDbSchema>>;

    constructor() {
        this.db = idb.openDB<FourtySwapDbSchema>('40swap', 1, {
            upgrade(db) {
                const store = db.createObjectStore('swap', { keyPath: 'swapId'});
                store.createIndex('by-created-at', 'createdAt', { unique: false });
            },
        });
    }

    async persist(swap: PersistedSwapIn|PersistedSwapOut): Promise<void> {
        await (await this.db).add('swap', swap);
    }

    async update<T extends PersistedSwapIn|PersistedSwapOut>(swap: Partial<T> & PersistedSwapKey): Promise<void> {
        const existing = await this.findById(swap.type, swap.swapId);
        if (existing == null) {
            throw new Error();
        }
        await (await this.db).put('swap', { ...existing, ...swap });
    }

    async findById<T extends SwapType>(type: T, swapId: PersistedSwapIn['swapId']): Promise<(T extends 'in' ? PersistedSwapIn : PersistedSwapOut)|null> {
        const obj = (await (await this.db).get('swap', swapId));
        if (obj != null && obj.type === type) {
            return obj as (T extends 'in' ? PersistedSwapIn : PersistedSwapOut);
        }
        return null;
    }

    async findAllLocally(): Promise<(PersistedSwapIn|PersistedSwapOut)[]> {
        return (await (await this.db).getAllFromIndex('swap', 'by-created-at')).reverse();
    }

    async delete(id: string): Promise<void> {
        return (await this.db).delete('swap', id);
    }

}