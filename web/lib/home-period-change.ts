import { formatCurrencyAmount } from "@/lib/currency-format";

export function getHomePeriodChange(current: number, previous: number, currency: string) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous < 0.005) return null;
  const difference = current - previous;
  const percent = difference / previous * 100;
  // Four-digit percentages obscure the useful scale of a change from a small base.
  const amountBased = Math.abs(percent) >= 1000;
  return {
    direction: Math.sign(difference),
    amountBased,
    label: amountBased
      ? `${formatCurrencyAmount(Math.abs(difference), currency)} ${difference >= 0 ? "more" : "less"}`
      : Math.abs(percent) < 0.5 ? "0%" : `${percent > 0 ? "+" : ""}${percent.toFixed(0)}%`,
  };
}
