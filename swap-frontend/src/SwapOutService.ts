import { GetSwapOutResponse } from '@40swap/shared';
import * as idb from 'idb';
import { IDBPDatabase } from 'idb';
import { FourtySwapDbSchema } from './SwapInService.js';

export type PersistedSwapOut = GetSwapOutResponse & {
    preImage: string,
    hash: string,
    claimKey: string,
    sweepAddress: string,
};

export class SwapOutService {

    private db: Promise<IDBPDatabase<FourtySwapDbSchema>>;

    constructor() {
        this.db = idb.openDB<FourtySwapDbSchema>('40swap', 1, {
            upgrade(db) {
                db.createObjectStore('swap-in', { keyPath: 'swapId'});
                db.createObjectStore('swap-out', { keyPath: 'swapId'});
            },
        });
    }

    async persistLocally(swap: PersistedSwapOut): Promise<void> {
        (await this.db).put('swap-out', swap);
    }

    async findLocally(swapId: PersistedSwapOut['swapId']): Promise<PersistedSwapOut|null> {
        return (await (await this.db).get('swap-out', swapId)) ?? null;
    }

}