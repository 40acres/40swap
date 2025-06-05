export type SwapType = 'in'|'out';

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
