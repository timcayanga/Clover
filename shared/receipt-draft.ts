export type ReceiptDraftFields = {
  merchant: string;
  date: string;
  amount: string;
  currency: string;
  accountId: string;
  categoryId: string;
};
export type ReceiptDraftPreview = {
  importId: string;
  fields: ReceiptDraftFields;
  accounts: { id: string; name: string; currency: string }[];
  categories: { id: string; name: string }[];
  transactionId: string | null;
  canEdit: boolean;
  fieldProvenance?: ReceiptDraftFieldProvenance;
};


export function missingReceiptDraftFieldCodes(fields: ReceiptDraftFields, accounts: ReceiptDraftPreview["accounts"]) {
  const date = new Date(fields.date);
  const amount = Number(fields.amount.replace(/,/gu, ""));
  return [
    ...(!fields.merchant.trim() ? ["merchant" as const] : []),
    ...(!/^\d{4}-\d{2}-\d{2}$/u.test(fields.date) || !Number.isFinite(+date) || date.toISOString().slice(0, 10) !== fields.date ? ["date" as const] : []),
    ...(!Number.isFinite(amount) || amount <= 0 ? ["total" as const] : []),
    ...(!/^[A-Z]{3}$/u.test(fields.currency) || ["XXX", "MIX"].includes(fields.currency) ? ["currency" as const] : []),
    ...(!accounts.some(account => account.id === fields.accountId && account.currency === fields.currency) ? ["payment_account" as const] : []),
  ];
}

const fieldLabels = {
  merchant: "the merchant",
  date: "the receipt date",
  total: "the total",
  currency: "the currency",
  payment_account: "the payment account",
};

export type ReceiptDraftMissingField = keyof typeof fieldLabels;

export function missingReceiptDraftFields(fields: ReceiptDraftFields, accounts: ReceiptDraftPreview["accounts"]) {
  return missingReceiptDraftFieldCodes(fields, accounts).map(field => fieldLabels[field]);
}

export type ReceiptDraftFieldProvenance = Partial<Record<keyof ReceiptDraftFields, {
  source: string;
  status: string;
  confidence: number | null;
  label?: string | null;
  reason?: string;
}>>;
