export type TransactionSourceMatch = {
  id: string;
  name: string;
  date: string;
  source: string;
  accountName: string;
  confirmed?: boolean;
  confidence: number;
  evidence: string[];
  canCopyLineItems: boolean;
};

export type TransactionSourceMatchAction = "copyReceiptFromTransactionId" | "dismissSourceMatchId" | "confirmSourceMatchId";
