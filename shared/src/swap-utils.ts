import Decimal from 'decimal.js';

const _100 = new Decimal(100);

export function getSwapInInputAmount(outputAmount: Decimal, feePercentage: Decimal): Decimal {
    return outputAmount.mul(_100).div(_100.minus(feePercentage)).toDecimalPlaces(8);
}

export function getSwapOutOutputAmount(inputAmount: Decimal, feePercentage: Decimal): Decimal {
    return inputAmount.mul(_100.minus(feePercentage)).div(_100).toDecimalPlaces(8);
}
