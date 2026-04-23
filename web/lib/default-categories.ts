import type { TransactionType } from "@/lib/domain-types";

export const DEFAULT_CATEGORY_ROWS = [
  { name: "Income", type: "income" },
  { name: "Food & Dining", type: "expense" },
  { name: "Transport", type: "expense" },
  { name: "Housing", type: "expense" },
  { name: "Bills & Utilities", type: "expense" },
  { name: "Travel & Lifestyle", type: "expense" },
  { name: "Entertainment", type: "expense" },
  { name: "Shopping", type: "expense" },
  { name: "Health & Wellness", type: "expense" },
  { name: "Education", type: "expense" },
  { name: "Financial", type: "expense" },
  { name: "Gifts & Donations", type: "expense" },
  { name: "Business", type: "expense" },
  { name: "Transfers", type: "transfer" },
  { name: "Other", type: "expense" },
] as const satisfies ReadonlyArray<{ name: string; type: TransactionType }>;
