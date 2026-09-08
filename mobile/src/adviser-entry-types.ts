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
