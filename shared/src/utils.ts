import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';

export const ECPair = ECPairFactory(ecc);

export type SwapType = 'in' | 'out';

export const jsonEquals = (prev: object | undefined | null, next: object | undefined | null): boolean => JSON.stringify(prev) === JSON.stringify(next);
