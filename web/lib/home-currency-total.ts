import { resolveFinancialTransactionType } from "./transaction-directions";
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

/** The hero combines currencies; dated report charts still retain separate currencies. */
export function convertHomeWindow(
  transactions: { date: Date; currency: string; amount: { toString(): string }; type: "income" | "expense" | "transfer"; isTransfer: boolean; category?: { name: string } | null }[],
  from: Date,
  to: Date,
  rates: Record<string, number | null | undefined>,
) {
  const rows = transactions.filter(row => row.date >= from && row.date < to);
  const total = (kind: "income" | "expense") => convertHomeTotal(
    rows.filter(row => resolveFinancialTransactionType({ ...row, categoryName: row.category?.name }) === kind)
      .map(row => ({ currency: row.currency, amount: row.amount.toString().replace(/^-/, "") })),
    rates,
  );
  return { income: total("income"), expense: total("expense") };
}
