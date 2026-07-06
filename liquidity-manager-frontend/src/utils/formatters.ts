import Decimal from 'decimal.js';

export function formatSats(sats: string | number): string {
    const amount = new Decimal(sats);
    return amount.toNumber().toLocaleString();
}

export function formatBtc(sats: string | number): string {
    const amount = new Decimal(sats).div(100000000);
    return amount.toFixed(8);
}

export function calculateBalancePercentage(localBalance: string, capacity: string): number {
    if (capacity === '0') return 0;
    const local = new Decimal(localBalance);
    const total = new Decimal(capacity);
    return local.div(total).mul(100).toNumber();
}
