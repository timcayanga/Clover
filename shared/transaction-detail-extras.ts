export type QuickLineItem = { description: string; amount: string; currency: string };

/** A user-confirmed line addition never changes the recorded transaction total. */
export function quickLineItem(name: string, amount: string, currency: string, count: number): QuickLineItem {
  const description = name.trim();
  if (!description || description.length > 500) throw new Error('Enter a name up to 500 characters.');
  if (count >= 100) throw new Error('A transaction can have up to 100 line items.');
  const value = amount.trim();
  if (!/^-?\d{1,12}(\.\d{1,2})?$/.test(value)) throw new Error('Enter an amount with up to two decimal places.');
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Choose a valid transaction currency.');
  return { description, amount: value, currency };
}

export function transactionConvertedAmount(amount: string, source: string, target: string, rates: Record<string, number>) {
  if (!amount.trim() || source === target || !source || !target) return null;
  const value = Number(amount), rate = rates[source];
  const result = value * rate;
  return Number.isFinite(value) && Number.isFinite(rate) && rate > 0 && Number.isFinite(result) ? result : null;
}
