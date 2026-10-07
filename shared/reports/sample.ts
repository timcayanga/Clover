import {
  analyzeReport,
  defaultReportView,
  reportPeriod,
  type ReportRow,
} from "./analysis";
import { reportCoverage, reportMerchants } from "./details";
import type { ReportsWorkspace } from "./workspace";
const rows: ReportRow[] = [];
for (const month of ["2026-07", "2026-08", "2026-09"])
  for (const [i, category, amount, type] of [
    [0, "Salary", 65000, "income"],
    [1, "Housing", 15000, "expense"],
    [2, "Food & Dining", 9500, "expense"],
    [3, "Groceries", 6500, "expense"],
    [4, "Transport", 4200, "expense"],
  ] as const)
    rows.push({
      id: month + i,
      date: month + "-05",
      amount,
      type,
      currency: "PHP",
      category,
      categoryId: category,
      merchant: category,
      accountId: "sample-bank",
      account: "Sample bank",
      reviewStatus: "confirmed",
      tags: ["household"],
    });
const view = {
  ...defaultReportView,
  range: "custom" as const,
  from: "2026-07-01",
  to: "2026-09-30",
  currency: "PHP",
};
const period = reportPeriod(view, "2026-10-07");
const analysis = analyzeReport(rows, period);
export const sampleReportsWorkspace: ReportsWorkspace = {
  workspaceId: "sample",
  profileName: "Demo household",
  merchants: [...new Set(rows.map((r) => r.merchant))],
  tags: [{ id: "household", name: "Household" }],
  paid: true,
  timeZone: "Asia/Manila",
  today: "2026-10-07",
  view,
  period,
  currencies: ["PHP"],
  accounts: [{ id: "sample-bank", name: "Sample bank" }],
  categories: [...new Set(rows.map((r) => r.category))].map((name) => ({
    id: name,
    name,
  })),
  reports: [
    {
      currency: "PHP",
      analysis,
      merchantAnalysis: reportMerchants(rows, period),
      coverage: reportCoverage(rows, period, view, [], true),
      budgets: ["2026-07", "2026-08", "2026-09"].map((month) => ({
        id: "food",
        name: "Dining",
        categoryId: "Food & Dining",
        categoryName: "Food & Dining",
        accountId: null,
        scope: "category",
        cadence: "monthly",
        month,
        from: month + "-01",
        to: month + (month === "2026-09" ? "-30" : "-31"),
        target: 10000,
        actual: 9500,
        remaining: 500,
        over: 0,
        partial: false,
      })),
      balances: [
        { date: "2026-07-01", balance: 125000 },
        { date: "2026-08-01", balance: 149800 },
        { date: "2026-09-01", balance: 179600 },
        { date: "2026-09-30", balance: 204400 },
      ],
      netWorth: [
        { date: "2026-07-01", balance: 125000 },
        { date: "2026-08-01", balance: 149800 },
        { date: "2026-09-01", balance: 179600 },
      ],
      knownAccounts: 1,
      accountCount: 1,
      cashFlow: [
        {
          id: "sample-bank",
          label: "Sample bank",
          beginningBalance: 125000,
          incomeAmount: 195000,
          color: "#08abc4",
          flows: analysis.categories.map((c) => ({
            key: c.name,
            label: c.name,
            amount: c.amount,
          })),
        },
      ],
      goal: {
        title: "Emergency fund",
        detail: "Continue setting aside part of your income.",
        progress: 68,
      },
    },
  ],
};
