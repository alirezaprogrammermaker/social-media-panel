/**
 * Customer charge in toman.
 * - Default / quantity-based: rate is price per 1000 units → (qty * rate) / 1000
 * - Package: rate is the flat package price (matches add-from-API conversion)
 */
export function calculateCustomerCharge(
    rate: string | number | null | undefined,
    quantity: number,
    serviceType?: string | null
): number {
    const rateNum = parseFloat(String(rate ?? '0'));
    if (!Number.isFinite(rateNum) || rateNum <= 0) {
        return 0;
    }

    if ((serviceType || 'Default') === 'Package') {
        return Math.ceil(rateNum);
    }

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
        return 0;
    }

    return Math.ceil((qty * rateNum) / 1000);
}

/** Convert provider USD (or other) rate to selling toman using settings dollar_rate. */
export function usdToToman(
    usdPrice: string | number | null | undefined,
    dollarRate: string | number | null | undefined
): number {
    const usd = parseFloat(String(usdPrice ?? '0'));
    const rate = parseFloat(String(dollarRate ?? '0'));
    if (!Number.isFinite(usd) || usd <= 0 || !Number.isFinite(rate) || rate <= 0) {
        return 0;
    }
    return Math.ceil(usd * rate);
}
