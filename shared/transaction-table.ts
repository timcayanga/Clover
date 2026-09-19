/** Portable table-entry contract. Draft rows never affect balances. */
export type TableRow = {
  key: string;
  date: string;
  merchant: string;
  type: "expense" | "income" | "transfer";
  accountId: string;
  categoryId: string;
  amount: string;
  currency: string;
  destinationAccountId: string;
  tags: string;
  notes: string;
};
export type TableOptions = {
  accounts: { id: string; name: string; currency: string; type?: string }[];
  categories: { id: string; name: string; type: string }[];
};
export const tableFields = [
  "date",
  "merchant",
  "type",
  "accountId",
  "categoryId",
  "amount",
] as const;
export const tableLabels: Record<keyof TableRow, string> = {
  key: "Row",
  date: "Date",
  merchant: "Name",
  type: "Type",
  accountId: "Account",
  categoryId: "Category",
  amount: "Amount",
  currency: "Currency",
  destinationAccountId: "To account",
  tags: "Tags",
  notes: "Notes",
};
export function emptyTableRow(key: string): TableRow {
  return {
    key,
    date: "",
    merchant: "",
    type: "expense",
    accountId: "",
    categoryId: "",
    amount: "",
    currency: "",
    destinationAccountId: "",
    tags: "",
    notes: "",
  };
}
export function populatedRow(row: TableRow) {
  return Boolean(
    row.date ||
      row.merchant ||
      row.accountId ||
      row.categoryId ||
      row.amount ||
      row.destinationAccountId ||
      row.tags ||
      row.notes ||
      row.currency ||
      row.type !== "expense",
  );
}
export function tableRowIssues(
  row: TableRow,
  options: TableOptions,
): Partial<Record<keyof TableRow, string>> {
  const issues: Partial<Record<keyof TableRow, string>> = {};
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
    !Number.isFinite(Date.parse(row.date)) ||
    new Date(row.date).toISOString().slice(0, 10) !== row.date
  )
    issues.date = "Choose a valid date.";
  if (!row.merchant.trim()) issues.merchant = "Add a name.";
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(row.amount) || Number(row.amount) <= 0)
    issues.amount = "Enter a positive amount with up to 2 decimals.";
  const account = options.accounts.find((a) => a.id === row.accountId);
  if (!account) issues.accountId = "Choose an account in this Profile.";
  else if (account.type === "investment")
    issues.accountId = "Use Add Trade for an investment holding.";
  if (
    !/^[A-Z]{3}$/.test(row.currency) ||
    (account && account.currency !== row.currency)
  )
    issues.currency = `Use ${account?.currency || "the account currency"}.`;
  if (row.type !== "transfer") {
    const category = options.categories.find((c) => c.id === row.categoryId);
    if (!category || category.type !== row.type)
      issues.categoryId = "Choose a category matching the transaction type.";
  } else {
    const to = options.accounts.find((a) => a.id === row.destinationAccountId);
    if (!to || to.id === row.accountId || to.type === "investment")
      issues.destinationAccountId =
        "Choose a different bank, wallet or cash account.";
    else if (to.currency !== row.currency)
      issues.destinationAccountId =
        "Choose an account in the same currency. Converted transfers need separate amounts.";
  }
  return issues;
}
/** Excel/Sheets clipboard TSV, including quoted tabs, escaped quotes and newlines. */
export function parseTablePaste(text: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' && (quoted || cell === "")) {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (c === "\t" || c === "\n" || c === "\r")) {
      row.push(cell);
      cell = "";
      if (c !== "\t") {
        result.push(row);
        row = [];
        if (c === "\r" && text[i + 1] === "\n") i++;
      }
    } else cell += c;
  }
  if (quoted) throw new Error("A pasted cell has an unclosed quote.");
  row.push(cell);
  if (row.some(Boolean)) result.push(row);
  return result;
}
export function duplicateTableKeys(rows: TableRow[]): Set<string> {
  const seen = new Map<string, string>();
  const duplicates = new Set<string>();
  for (const r of rows.filter(populatedRow)) {
    const signature = JSON.stringify([
      r.date,
      r.merchant.trim().toLowerCase(),
      r.type,
      r.accountId,
      r.destinationAccountId,
      r.currency,
      Number(r.amount),
    ]);
    const first = seen.get(signature);
    if (first) {
      duplicates.add(first);
      duplicates.add(r.key);
    } else seen.set(signature, r.key);
  }
  return duplicates;
}
