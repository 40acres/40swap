// Original file: src/lnd/lightning.proto

export const CoinSelectionStrategy = {
    STRATEGY_USE_GLOBAL_CONFIG: 'STRATEGY_USE_GLOBAL_CONFIG',
    STRATEGY_LARGEST: 'STRATEGY_LARGEST',
    STRATEGY_RANDOM: 'STRATEGY_RANDOM',
} as const;

export type CoinSelectionStrategy = 'STRATEGY_USE_GLOBAL_CONFIG' | 0 | 'STRATEGY_LARGEST' | 1 | 'STRATEGY_RANDOM' | 2;

export type CoinSelectionStrategy__Output = (typeof CoinSelectionStrategy)[keyof typeof CoinSelectionStrategy];
