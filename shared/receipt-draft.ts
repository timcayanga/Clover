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
};
