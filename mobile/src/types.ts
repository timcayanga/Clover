export type Transaction = {
  source?: string;
  userNote?: string | null;
  parsedNote?: string | null;
  receiptLineItems?: { description: string; amount?: string | null; currency?: string | null }[];
  updatedAt?: string;
  pendingSync?: boolean;
  isTransfer?: boolean;
  isExcluded?: boolean;
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
  categoryId?: string | null;
  confidenceScore?: number | null;
  reviewStatus: string | null;
  tags?: { id: string; name: string }[];
};
export type TransactionPage = {
  summary?: {
    currencyTotals?: Record<
      string,
      { income: number; spending: number; transfers: number }
    >;
  };
  transactions: Transaction[];
  totalCount: number;
  page: number;
};
export type Profile = { id: string; name: string };
export type Bootstrap = {
  offlineEpoch?: string | null;
  preferences?: import("../../shared/app-preferences").AppPreferences;
  needsOnboarding?: boolean;
  currencyChoices?: { code: string; name: string }[];
  firstName: string | null;
  profiles: Profile[];
  entitlement: {
    analytics?: Record<string, string | number | boolean | null>;
    planTier: "free" | "pro" | "premium";
    fullFeatureAccess?: boolean;
    accessEndsAt: string | null;
    renewing: boolean;
    nativePurchasesAvailable: boolean;
  };
};
export type ImportStatus = {
  nativeUploadReceived?: boolean;
  nativeUploadFinalizing?: boolean;
  progress?: number;
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
