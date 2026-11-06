export function circleExpensePayerTotals(expenses: readonly {
  paidByMemberId?: string | null;
  paidByName?: string | null;
  amount: number;
  currency: string;
}[]) {
  const totals = new Map<string, { id: string; name: string; currency: string; amount: number }>();
  for (const expense of expenses) {
    if (!expense.paidByMemberId || !expense.paidByName) continue;
    const id = `${expense.paidByMemberId}:${expense.currency}`;
    const previous = totals.get(id)?.amount ?? 0;
    totals.set(id, { id, name: expense.paidByName, currency: expense.currency, amount: Math.round((previous + expense.amount) * 100) / 100 });
  }
  return [...totals.values()];
}
