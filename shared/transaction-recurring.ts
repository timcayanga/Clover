export function nextMonth(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  const day = date.getUTCDate();
  date.setUTCMonth(date.getUTCMonth() + 1, 1);
  date.setUTCDate(Math.min(day, new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()));
  return date.toISOString().slice(0, 10);
}
export function transactionRecurringInput(transaction: { id: string; amount: string; currency: string; accountId: string | null }, title: string, dueDate: string, recurrence: string) {
  return { title, kind: "planned_payment", counterparty: title, amount: transaction.amount.replace(/^-/, ""), currency: transaction.currency, dueDate, nextDueDate: dueDate, recurrence, accountId: transaction.accountId, evidenceTransactionIds: [transaction.id], status: "active" };
}
