import { cashForecast } from "./outlook";
import { buildRecoveryReport } from "./recoveries";
import { accountImportCoverage } from "./import-coverage";
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
rows.push({
  id: "sample-refund",
  date: "2026-09-06",
  amount: 500,
  type: "income",
  currency: "PHP",
  category: "Refund",
  merchant: "Dining refund",
  accountId: "sample-bank",
  account: "Sample bank",
  reviewStatus: "confirmed",
  tags: ["household"],
});
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
      forecast: cashForecast(
        "2026-10-07",
        58000,
        [
          {
            id: "rent",
            title: "Rent",
            date: "2026-10-10",
            amount: 15000,
            direction: "out",
          },
          {
            id: "ana",
            title: "Money owed by Ana",
            date: "2026-10-15",
            amount: 12000,
            direction: "in",
          },
          {
            id: "loan",
            title: "Loan payment",
            date: "2026-10-20",
            amount: 8500,
            direction: "out",
          },
        ],
        [],
        ["Utilities: Variable amount"],
      ),
      recurringCosts: {
        from: "2026-10-07",
        to: "2027-10-06",
        outgoing30: 23500,
        incoming30: 12000,
        outgoingYear: 197000,
        monthlyEquivalent: 197000 / 12,
        overdueCount: 1,
        rows: [
          {
            id: "rent",
            title: "Rent",
            cadence: "monthly",
            direction: "out",
            nextDate: "2026-10-10",
            nextAmount: 15000,
            cost30: 15000,
            costYear: 180000,
            excludedReason: null,
            latestPayment: {
              date: "2026-09-10",
              amount: 15000,
              previous: 14000,
            },
          },
          {
            id: "utilities",
            title: "Utilities",
            cadence: "monthly",
            direction: "out",
            nextDate: "2026-10-15",
            nextAmount: null,
            cost30: 0,
            costYear: 0,
            excludedReason: "Variable amount",
            latestPayment: null,
          },
          {
            id: "loan",
            title: "Loan payment",
            cadence: "monthly",
            direction: "out",
            nextDate: "2026-10-20",
            nextAmount: 8500,
            cost30: 8500,
            costYear: 17000,
            excludedReason: null,
            latestPayment: null,
          },
        ],
      },
      netWorthChange: {
        from: "2026-07-01",
        to: "2026-09-30",
        change: 9000,
        groups: [
          { name: "Bank, wallet and cash", change: 4000 },
          { name: "Investments", change: 3000 },
          { name: "Liabilities", change: 2000 },
        ],
        accounts: [
          {
            id: "sample-bank",
            name: "Sample bank",
            group: "Bank, wallet and cash",
            opening: { date: "2026-06-30", balance: 10000 },
            closing: { date: "2026-09-30", balance: 14000 },
            change: 4000,
            issue: null,
          },
          {
            id: "sample-investment",
            name: "Sample investments",
            group: "Investments",
            opening: { date: "2026-06-30", balance: 20000 },
            closing: { date: "2026-09-30", balance: 23000 },
            change: 3000,
            issue: null,
          },
          {
            id: "sample-loan",
            name: "Sample loan",
            group: "Liabilities",
            opening: { date: "2026-06-30", balance: -5000 },
            closing: { date: "2026-09-30", balance: -3000 },
            change: 2000,
            issue: null,
          },
        ],
      },

      currency: "PHP",
      analysis,
      merchantAnalysis: reportMerchants(rows, period),
      coverage: reportCoverage(rows, period, view, [], true),
      recoveries: buildRecoveryReport(
        rows,
        rows,
        [
          {
            id: "sample-link",
            expenseId: "2026-092",
            incomingId: "sample-refund",
            kind: "refund",
            amount: 500,
          },
        ],
        period,
        "PHP",
      ),
      importCoverage: [
        accountImportCoverage(
          {
            id: "sample-bank",
            name: "Sample bank",
            type: "bank",
            createdDay: "2026-07-01",
          },
          [
            {
              from: "2026-07-01",
              to: "2026-08-31",
              status: "reconciled",
              done: true,
              statement: true,
            },
          ],
          [
            {
              lastSyncedAt: "2026-10-03T12:00:00Z",
              status: "ready",
              error: false,
            },
          ],
          period,
          new Date("2026-10-07T12:00:00Z"),
        ),
      ],
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
        historyBasis: month === "2026-07" ? "estimate" : "recorded",
        historyKnownFrom: "2026-08-01",
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
