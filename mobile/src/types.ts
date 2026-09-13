export type Transaction = {
  id: string;
  workspaceId: string;
  accountId: string;
  accountName: string;
  lastFour?: string;
  date: string;
  amount: string;
  currency: string;
  type: "income" | "expense" | "transfer";
  merchantRaw: string;
  merchantClean: string | null;
  description: string | null;
  categoryName: string | null;
  reviewStatus: string | null;
  tags?: { id: string; name: string }[];
};
export type TransactionPage = {
  summary?: { currencyTotals?: Record<string,{income:number;spending:number;transfers:number}> };
  transactions: Transaction[];
  totalCount: number;
  page: number;
};
export type Profile = { id: string; name: string };
export type Bootstrap = {
  firstName: string | null;
  profiles: Profile[];
  entitlement: {
    planTier: "free" | "pro";
    fullFeatureAccess?: boolean;
    accessEndsAt: string | null;
    renewing: boolean;
    nativePurchasesAvailable: false;
  };
};
export type ImportStatus = {
  importFile: {
    id: string;
    fileName: string;
    status: string;
    processingMessage?: string;
    processingPhase?: string;
  };
  visibleImportComplete?: boolean;
  confirmedTransactionsCount?: number;
  parsedRowsCount?: number;
};
