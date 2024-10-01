import { GetSwapInResponse } from '@40swap/shared';
import * as idb from 'idb';
import { DBSchema, IDBPDatabase } from 'idb';

export type PersistedSwapIn = GetSwapInResponse & { refundKey: string };

interface FourtySwapDbSchema extends DBSchema {
    'swap-in': {
        key: string,
        value: PersistedSwapIn,
    };
}

export class SwapInService {

    private db: Promise<IDBPDatabase<FourtySwapDbSchema>>;

    constructor() {
        this.db = idb.openDB<FourtySwapDbSchema>('40swap', 1, {
            upgrade(db) {
                db.createObjectStore('swap-in', { keyPath: 'swapId'});
            },
        });
    }

    async persistLocally(swap: PersistedSwapIn): Promise<void> {
        const tx = (await this.db).transaction('swap-in', 'readwrite');
        const store = tx.objectStore('swap-in');
        await store.put(swap);
        await tx.done;
    }

    async findLocally(swapId: PersistedSwapIn['swapId']): Promise<PersistedSwapIn|null> {
        return (await (await this.db).get('swap-in', swapId)) ?? null;
    }

}