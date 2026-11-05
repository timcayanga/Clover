// The agreed payment is independent of the amount settled in the original bill.
export function paymentRequestAmounts(
  input: {
    amount: unknown;
    currency?: string | null;
    billAmount?: unknown;
    billCurrency?: string | null;
  },
  currentBillCurrency: string,
) {
  const currency = (input.currency || currentBillCurrency).toUpperCase();
  const billCurrency = (
    input.billCurrency || currentBillCurrency
  ).toUpperCase();
  if (
    !/^[A-Z]{3}$/.test(currency) ||
    billCurrency !== currentBillCurrency.toUpperCase()
  )
    throw new Error(
      "The original bill currency has changed. Create a new payment request.",
    );
  const amount = Number(input.amount);
  const billAmount =
    input.billAmount == null
      ? currency === billCurrency
        ? amount
        : NaN
      : Number(input.billAmount);
  if (
    ![amount, billAmount].every(
      (n) =>
        Number.isFinite(n) &&
        n > 0 &&
        Number(n.toFixed(2)) > 0 &&
        n <= 99999999999999.99,
    )
  )
    throw new Error(
      "Enter the agreed payment amount and the original bill amount it settles.",
    );
  if (currency === billCurrency && Math.abs(amount - billAmount) > 0.005)
    throw new Error(
      "For the same currency, the payment and bill amounts must match.",
    );
  return {
    amount: Number(amount.toFixed(2)),
    currency,
    billAmount: Number(billAmount.toFixed(2)),
    billCurrency,
  };
}
export function paymentOptionLabel(provider: string, nickname: string) {
  const p = provider.trim(),
    n = nickname.trim();
  return !n || n.toLowerCase() === p.toLowerCase() ? p : `${p} · ${n}`;
}
