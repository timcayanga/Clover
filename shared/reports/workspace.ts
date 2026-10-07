import type { ReportAnalysis, ReportView, ReportPeriod } from "./analysis";
export type SavedReport = {
  id: string;
  name: string;
  view: ReportView;
  revision: number;
};
export type ReportCurrencyData = {
  budgets?: BudgetReportRow[];
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
