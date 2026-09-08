// Shared wire contract: mirror in mobile/src/adviser-entry-types.ts.
export type EntryAccount = {
  key: string;
  name: string;
  institution: string;
  type:
    | "bank"
    | "wallet"
    | "credit_card"
    | "cash"
    | "loan"
    | "other"
    | "investment";
  currency: string;
  balance: string;
  investmentSubtype: string;
  investmentSymbol: string;
  investmentQuantity: string;
  investmentCostBasis: string;
};
export type EntryLine = {
  description: string;
  quantity: string;
  unitPrice: string;
  kind: "item" | "tax" | "discount";
};
export type EntryTransaction = {
  key: string;
  merchant: string;
  accountId: string;
  categoryId: string;
  type: "expense" | "income";
  currency: string;
  amount: string;
  date: string;
  description: string;
  lines: EntryLine[];
};
export type EntryReceipt = {
  transactionId: string;
  expectedUpdatedAt: string;
  lines: EntryLine[];
};
export type EntryDraft = {
  attachmentIds?: string[];
  version: 1;
  id: string;
  workspaceId: string;
  sourceText: string;
  confidence: number;
  accounts: EntryAccount[];
  transactions: EntryTransaction[];
  receipts: EntryReceipt[];
};
export type EntryFormContext = {
  kind: "transaction" | "account" | "investment" | "receipt";
  recordId?: string;
  focusedField?: string;
  fields: Record<string, string>;
  errors?: string[];
};
export const entryLine = (): EntryLine => ({
  description: "",
  quantity: "1",
  unitPrice: "",
  kind: "item",
});
export const entryTransaction = (key: string): EntryTransaction => ({
  key,
  merchant: "",
  accountId: "",
  categoryId: "",
  type: "expense",
  currency: "PHP",
  amount: "",
  date: "",
  description: "",
  lines: [],
});
export const entryAccount = (key: string): EntryAccount => ({
  key,
  name: "",
  institution: "",
  type: "bank",
  currency: "PHP",
  balance: "",
  investmentSubtype: "",
  investmentSymbol: "",
  investmentQuantity: "",
  investmentCostBasis: "",
});
export function minorUnits(text: string): bigint | null {
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}
export function formatMinor(value: string): string {
  const amount = BigInt(value);
  const sign = amount < 0n ? "-" : "";
  const positive = amount < 0n ? -amount : amount;
  return `${sign}${positive / 100n}.${String(positive % 100n).padStart(2, "0")}`;
}
export function lineTotal(lines: EntryLine[]): string | null {
  let total = 0n;
  for (const line of lines) {
    const price = minorUnits(line.unitPrice);
    if (price === null || !/^\d{1,5}(?:\.\d{1,3})?$/.test(line.quantity))
      return null;
    const [whole, fraction = ""] = line.quantity.split(".");
    const quantity = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0"));
    if (quantity <= 0n) return null;
    const amount = (price * quantity + 500n) / 1000n;
    total += line.kind === "discount" ? -amount : amount;
  }
  return total.toString();
}
export function entryIssues(draft: EntryDraft): string[] {
  const errors: string[] = [];
  if (
    !draft.accounts.length &&
    !draft.transactions.length &&
    !draft.receipts.length
  )
    errors.push("Add at least one entry.");
  const keys = new Set<string>();
  for (const account of draft.accounts) {
    if (!account.key || keys.has(account.key))
      errors.push("Account references must be unique.");
    keys.add(account.key);
    if (
      !account.name.trim() ||
      !/^[A-Z]{3}$/.test(account.currency) ||
      minorUnits(account.balance) === null
    )
      errors.push(
        "Each account needs a name, currency and non-negative opening balance.",
      );
    for (const field of [
      account.investmentQuantity,
      account.investmentCostBasis,
    ])
      if (field && !/^\d{1,12}(?:\.\d{1,8})?$/.test(field))
        errors.push(
          "Investment quantity and cost basis must be valid non-negative numbers.",
        );
  }
  const transactionKeys = new Set<string>();
  draft.transactions.forEach((row, index) => {
    const label = `Transaction ${index + 1}`;
    if (!row.key || transactionKeys.has(row.key))
      errors.push("Transaction references must be unique.");
    transactionKeys.add(row.key);
    if (
      !row.merchant.trim() ||
      !row.accountId ||
      !row.currency.match(/^[A-Z]{3}$/) ||
      minorUnits(row.amount) === null ||
      minorUnits(row.amount) === 0n
    )
      errors.push(
        `${label}: enter a merchant, account, currency and positive amount.`,
      );
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
      !Number.isFinite(Date.parse(row.date)) ||
      new Date(row.date).toISOString().slice(0, 10) !== row.date
    )
      errors.push(`${label}: choose a valid date.`);
    if (row.accountId.startsWith("new:") && !keys.has(row.accountId.slice(4)))
      errors.push(`${label}: choose an existing or drafted account.`);
    if (
      row.lines.length &&
      lineTotal(row.lines) !== minorUnits(row.amount)?.toString()
    )
      errors.push(
        `${label}: receipt items, tax and discounts must match the payment amount.`,
      );
  });
  for (const receipt of draft.receipts)
    if (
      !receipt.transactionId ||
      !receipt.expectedUpdatedAt ||
      !receipt.lines.length
    )
      errors.push(
        "Choose the receipt transaction and load its current version.",
      );
  for (const line of [
    ...draft.transactions.flatMap((row) => row.lines),
    ...draft.receipts.flatMap((row) => row.lines),
  ])
    if (!line.description.trim() || lineTotal([line]) === null)
      errors.push(
        "Receipt items need a description, positive quantity and non-negative unit price.",
      );
  return [...new Set(errors)];
}

/** Runtime guard for the native client; incomplete drafts remain editable. */
export function isEntryDraft(value: unknown): value is EntryDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as EntryDraft;
  const strings = (row: unknown, keys: string[]) =>
    !!row &&
    typeof row === "object" &&
    keys.every(
      (key) => typeof (row as Record<string, unknown>)[key] === "string",
    );
  const lines = (value: unknown) =>
    Array.isArray(value) &&
    value.length <= 100 &&
    value.every(
      (line) =>
        strings(line, ["description", "quantity", "unitPrice"]) &&
        ["item", "tax", "discount"].includes(line.kind),
    );
  return (
    (draft.attachmentIds === undefined || (Array.isArray(draft.attachmentIds) && draft.attachmentIds.length <= 3 && draft.attachmentIds.every(id => typeof id === "string" && /^adviser_file_[a-f0-9-]{36}$/.test(id)))) &&
    draft.version === 1 &&
    typeof draft.id === "string" &&
    !!draft.id &&
    typeof draft.workspaceId === "string" &&
    !!draft.workspaceId &&
    typeof draft.sourceText === "string" &&
    draft.sourceText.length <= 4000 &&
    typeof draft.confidence === "number" &&
    draft.confidence >= 0 &&
    draft.confidence <= 100 &&
    Array.isArray(draft.accounts) &&
    draft.accounts.length <= 10 &&
    draft.accounts.every(
      (row) =>
        strings(row, Object.keys(entryAccount(""))) &&
        [
          "bank",
          "wallet",
          "credit_card",
          "cash",
          "loan",
          "other",
          "investment",
        ].includes(row.type),
    ) &&
    Array.isArray(draft.transactions) &&
    draft.transactions.length <= 50 &&
    draft.transactions.every(
      (row) =>
        strings(
          row,
          Object.keys(entryTransaction("")).filter((key) => key !== "lines"),
        ) &&
        ["expense", "income"].includes(row.type) &&
        lines(row.lines),
    ) &&
    Array.isArray(draft.receipts) &&
    draft.receipts.length <= 10 &&
    draft.receipts.every(
      (row) =>
        strings(row, ["transactionId", "expectedUpdatedAt"]) &&
        lines(row.lines),
    )
  );
}
