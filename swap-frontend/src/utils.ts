export type SwapType = 'in' | 'out' | "chain";
export enum AssetType {
    ON_CHAIN_BITCOIN,
    LIGHTNING_BITCOIN,
    ON_CHAIN_LIQUID,
}

export const jsonEquals = (prev: object|undefined, next: object|undefined): boolean => JSON.stringify(prev) === JSON.stringify(next);

export function currencyFormat(am: number, currency = 'BTC', withCurrencySymbol = true): string {
    const decimalPlaces = 8;
    if (!withCurrencySymbol) {
        return Intl.NumberFormat(undefined, {
            minimumFractionDigits: decimalPlaces,
            maximumFractionDigits: decimalPlaces,
        }).format(am);
    }
    return am.toLocaleString(undefined, {
        style: 'currency',
        currency,
        minimumFractionDigits: decimalPlaces,
    });
}
