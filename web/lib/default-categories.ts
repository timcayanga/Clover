import type { TransactionType } from "@/lib/domain-types";

export const DEFAULT_CATEGORY_ROWS = [
  { name: "Bills & Utilities", type: "expense" },
  { name: "Business", type: "expense" },
  { name: "Cash & ATM", type: "expense" },
  { name: "Education", type: "expense" },
  { name: "Entertainment", type: "expense" },
  { name: "Financial", type: "expense" },
  { name: "Food & Dining", type: "expense" },
  { name: "Gifts & Donations", type: "expense" },
  { name: "Health & Wellness", type: "expense" },
  { name: "Housing", type: "expense" },
  { name: "Income", type: "income" },
  { name: "Other", type: "expense" },
  { name: "Shopping", type: "expense" },
  { name: "Subscriptions", type: "expense" },
  { name: "Transfers", type: "transfer" },
  { name: "Transport", type: "expense" },
  { name: "Travel & Lifestyle", type: "expense" },
] as const satisfies ReadonlyArray<{ name: string; type: TransactionType }>;
