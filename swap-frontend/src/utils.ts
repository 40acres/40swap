export type SwapType = 'in'|'out';

export type Asset = 'ON_CHAIN_BITCOIN' | 'LIGHTNING_BITCOIN';

export const jsonEquals = (prev: object|undefined, next: object|undefined): boolean => JSON.stringify(prev) === JSON.stringify(next);
