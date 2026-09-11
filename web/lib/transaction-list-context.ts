import { z } from "zod";

export const transactionListContextKey = "clover.transaction-list-context.v1";
const schema = z.object({
  query: z.string(), categoryFilters: z.array(z.string()), tagFilters: z.array(z.string()),
  accountFilters: z.array(z.string()), typeFilters: z.array(z.enum(["debit", "credit", "transfer"])),
  dateFilterMode: z.enum(["ltd", "day", "week", "month", "quarter", "year", "custom"]),
  dateFilterAnchor: z.string(), customStart: z.string(), customEnd: z.string(),
  amountMin: z.string(), amountMax: z.string(),
  sortField: z.enum(["date", "name", "account", "category", "amount"]),
  sortDirection: z.enum(["asc", "desc"]),
});
export type TransactionListContext = z.infer<typeof schema>;
export function readTransactionListContext(workspaceId: string): TransactionListContext | null {
  try {
    const stored = JSON.parse(sessionStorage.getItem(transactionListContextKey) || "null");
    const result = schema.safeParse(stored?.[workspaceId]);
    return result.success ? result.data : null;
  } catch { return null; }
}
export function writeTransactionListContext(workspaceId: string, context: TransactionListContext) {
  try {
    const stored = JSON.parse(sessionStorage.getItem(transactionListContextKey) || "{}");
    const contexts = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
    contexts[workspaceId] = context;
    sessionStorage.setItem(transactionListContextKey, JSON.stringify(contexts));
  } catch { /* Storage may be disabled. */ }
}
