import type { CashForecast, RecurringCosts, NetWorthChange } from "./outlook";
import type { ReportAnalysis, ReportView, ReportPeriod } from "./analysis";
export type SavedReport = {
  id: string;
  name: string;
  view: ReportView;
  revision: number;
};
export type ReportCurrencyData = {
  forecast?: CashForecast;
  recurringCosts?: RecurringCosts;
  netWorthChange?: NetWorthChange;
  budgets?: BudgetReportRow[];
  recoveries?: RecoveryReport;
  importCoverage?: AccountImportCoverage[];
  coverage?: ReportCoverage;
  merchantAnalysis?: MerchantReportRow[];
  currency: string;
  analysis: ReportAnalysis;
  balances: { date: string; balance: number }[];
  netWorth: { date: string; balance: number }[];
  knownAccounts: number;
  accountCount: number;
  cashFlow: {
    id: string;
    label: string;
    beginningBalance: number;
    incomeAmount: number;
    color: string;
    flows: { key: string; label: string; amount: number }[];
  }[];
  goal: { title: string; detail: string; progress: number | null } | null;
};
export type MerchantReportRow = {
  name: string;
  amount: number;
  previous: number;
  count: number;
  change: number;
};
export type BudgetReportRow = {
  historyBasis?: "recorded" | "estimate";
  historyKnownFrom?: string;
  revision?: number;
  id: string;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  accountId: string | null;
  scope: string;
  cadence: string;
  month: string;
  from: string;
  to: string;
  target: number;
  actual: number;
  remaining: number;
  over: number;
  partial: boolean;
};
export type ReportCoverage = {
  transactionCount: number;
  reviewCount: number;
  uncategorizedCount: number;
  firstTransaction: string | null;
  lastTransaction: string | null;
  missingBalanceAccounts: string[];
  datedHistoryAvailable: boolean;
  notes: string[];
};
export type ReportsWorkspace = {
  workspaceId: string;
  profileName?: string;
  paid: boolean;
  timeZone: string;
  today: string;
  view: ReportView;
  period: ReportPeriod;
  currencies: string[];
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  merchants?: string[];
  tags?: { id: string; name: string }[];
  reports: ReportCurrencyData[];
};
export function reportViewParams(view: ReportView) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(view)) {
    if (Array.isArray(v)) {
      if (v.length) p.set(k, JSON.stringify(v));
    } else if (v) p.set(k, v);
  }
  if (view.range !== "custom") {
    p.delete("from");
    p.delete("to");
  }
  return p;
}

export type RecoveryLink = {
  id: string;
  expenseId: string;
  incomingId: string;
  kind: "refund" | "reimbursement";
  amount: number;
  expenseName: string;
  incomingName: string;
  expenseDate: string;
  receivedDate: string;
  issue?: string;
};
export type RecoveryReport = {
  gross: number;
  refunds: number;
  reimbursements: number;
  personalCost: number;
  receivedForEarlierExpenses: number;
  links: RecoveryLink[];
  notes: string[];
};
export type AccountImportCoverage = {
  accountId: string;
  name: string;
  from: string;
  to: string;
  statementPeriods: { from: string; to: string; status: string }[];
  gaps: { from: string; to: string }[];
  undatedStatements: number;
  pendingStatements: number;
  lastSyncedAt: string | null;
  connectionState: "not_connected" | "current" | "stale" | "attention";
  note: string;
};
export type RecoveryCandidate = {
  id: string;
  name: string;
  date: string;
  amount: number;
  available: number;
  account: string;
  currency: string;
};
