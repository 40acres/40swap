import { GetSwapInResponse, GetSwapOutResponse } from '@40swap/shared';
import * as idb from 'idb';
import { DBSchema, IDBPDatabase } from 'idb';

type SwapType = 'in'|'out';
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
    };
}

export class LocalSwapStorageService {

    private db: Promise<IDBPDatabase<FourtySwapDbSchema>>;

    constructor() {
        this.db = idb.openDB<FourtySwapDbSchema>('40swap', 1, {
            upgrade(db) {
                db.createObjectStore('swap', { keyPath: 'swapId'});
            },
        });
    }

    async persist(swap: PersistedSwapIn|PersistedSwapOut): Promise<void> {
        (await this.db).put('swap', swap);
    }

    async findById<T extends SwapType>(type: T, swapId: PersistedSwapIn['swapId']): Promise<(T extends 'in' ? PersistedSwapIn : PersistedSwapOut)|null> {
        const obj = (await (await this.db).get('swap', swapId));
        if (obj != null && obj.type === type) {
            return obj as (T extends 'in' ? PersistedSwapIn : PersistedSwapOut);
        }
        return null;
    }

    async findAllLocally(): Promise<(PersistedSwapIn|PersistedSwapOut)[]> {
        return await (await this.db).getAll('swap');
    }

}