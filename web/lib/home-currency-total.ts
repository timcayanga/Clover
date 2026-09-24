import { Prisma } from "@prisma/client";

const Decimal = Prisma.Decimal.clone({ precision: 40 });

/** Convert before summing; never present a partial total as a complete estimate. */
export function convertHomeTotal(
  values: { currency: string; amount: number | string }[],
  rates: Record<string, number | null | undefined>,
): string | null {
  let total = new Decimal(0);
  for (const value of values) {
    const amount = new Decimal(value.amount);
    if (amount.isZero()) continue;
    const rate = rates[value.currency];
    if (rate == null || !Number.isFinite(rate) || rate <= 0) return null;
    total = total.plus(amount.times(String(rate)));
  }
  return total.toFixed(2);
}
