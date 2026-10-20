/** Defaults apply only to a new manual draft, never to an existing record. */
export type ManualTransactionType = "income" | "expense" | "transfer" | "credit" | "debit";
export const manualTransactionName = (type: ManualTransactionType) =>
  type === "income" || type === "credit" ? "Income" : type === "transfer" ? "Transfer" : "Expense";
export const manualTransactionPlaceholder = (type: ManualTransactionType) =>
  type === "income" || type === "credit" ? "Salary" : type === "transfer" ? "Transfer" : "Lunch";
export function manualTransactionToday(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
export function validManualTransactionDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
}
export function manualTransactionCategoryId<T extends { id: string; name: string }>(categories: T[], type: ManualTransactionType, selected?: string | null) {
  const current = categories.find(category => category.id === selected);
  if (current && !/^(other|uncategorized)$/i.test(current.name.trim())) return current.id;
  const name = type === "income" || type === "credit" ? "Income" : type === "transfer" ? "Transfers" : "Other";
  return categories.find(category => category.name.trim().toLowerCase() === name.toLowerCase())?.id ?? selected ?? "";
}
