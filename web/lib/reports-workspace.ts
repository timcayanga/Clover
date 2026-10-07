import {hasTransactionUserEdits} from "./transaction-user-edits";
import {transactionNeedsReview} from "./transaction-review-reasons";
import { prisma } from "./prisma";
import { buildActiveWorkspaceTransactionWhere } from "./transaction-query";
import { getEffectiveTransactionCategoryName } from "./transaction-display";
import { resolveFinancialTransactionType } from "./transaction-directions";
import { getTransactionSummaryTypeOverrides } from "./transaction-summary";
import { normalizeRegionalPreferences } from "./regional-preferences";
import {
  reportAccountBalance,
  reportCashMovements,
  buildReportBalanceSeries,
} from "./report-balances";
import { buildReportNetWorth } from "./report-net-worth-data";
import { getCalendarDayEndInTimeZone } from "./report-window";
import { finverseBalances } from "./finverse-balances";
import { normalizeAccountBalanceSign } from "./account-balance";
import { getProAccess } from "./pro-access";
import { hasFullFeatureAccess } from "./beta-access";
import { resolveReportCurrency } from "./report-currency";
import {
  getGoalProgressSnapshot,
  normalizeGoalPlan,
  type GoalKey,
} from "./goals";
import {
  analyzeReport,
  reportDay,
  reportPeriod,
  selectedReportRows,
  savingsRate,
  shiftDay,
  type ReportView,
  type ReportRow,
} from "../../shared/reports/analysis";
import type { ReportsWorkspace } from "../../shared/reports/workspace";

/** All report reads are scoped to a Profile authorized by the caller. No financial writes. */
export async function loadReportsWorkspace(
  userId: string,
  workspaceId: string,
  view: ReportView,
  now = new Date(),
): Promise<ReportsWorkspace> {
  const [user, access, accounts, transactions, categories, bankBalances] =
    await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          regionalPreferences: true,
          primaryGoal: true,
          goalTargetAmount: true,
          goalPlan: true,
        },
      }),
      getProAccess(userId),
      prisma.account.findMany({
        where: { workspaceId },
        include: {
          transactions: {
            where: {
              deletedAt: null,
              isExcluded: false,
              account: {
                OR: [
                  { source: { in: ["manual", "adviser_manual"] } },
                  { type: "cash" },
                ],
              },
            },
            select: {
              id: true,
              date: true,
              createdAt: true,
              amount: true,
              currency: true,
              type: true,
              merchantRaw: true,
              merchantClean: true,
              description: true,
              rawPayload: true,
            },
          },
          statementCheckpoints: { orderBy: { createdAt: "desc" } },
        },
      }),
      prisma.transaction.findMany({
        where: buildActiveWorkspaceTransactionWhere(workspaceId),
        select: {
          id: true,
          accountId: true,
          date: true,
          createdAt: true,
          amount: true,
          currency: true,
          type: true,
          isTransfer: true,
          importFileId: true,
          reviewStatus: true,
          normalizedPayload:true,parserConfidence:true,categoryConfidence:true,accountMatchConfidence:true,duplicateConfidence:true,isExcluded:true,categoryId:true,
          merchantRaw: true,
          merchantClean: true,
          description: true,
          rawPayload: true,
          category: { select: { id: true, name: true } },
          account: {
            select: {
              id: true,
              name: true,
              type: true,
              institution: true,
              currency: true,
            },
          },
        },
      }),
      prisma.category.findMany({
        where: { workspaceId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      finverseBalances(workspaceId),
    ]);
  const { timeZone, baseCurrency } = normalizeRegionalPreferences(
      user.regionalPreferences,
    ),
    today = reportDay(now, timeZone);
  const paid = hasFullFeatureAccess(access.planTier);
  const currencySelection = resolveReportCurrency(
    [...accounts.map((a) => a.currency), ...transactions.map(t=>t.currency)],
    baseCurrency,
    view.currency || undefined,
  );
  view = { ...view, currency: currencySelection.currentCurrency };
  const resolvedCategories = new Map(
    transactions.map((t) => [
      t.id,
      hasTransactionUserEdits(t) ? t.category?.name ?? "Other" : getEffectiveTransactionCategoryName({
        categoryName: t.category?.name ?? null,
        rawPayload: t.rawPayload as never,
        merchantRaw: t.merchantRaw,
        merchantClean: t.merchantClean,
        description: t.description,
        institution: t.account.institution,
        source: t.importFileId ? "upload" : "manual",
        type: t.type,
      }) ?? "Uncategorized",
    ]),
  );
  const overrides = getTransactionSummaryTypeOverrides(
    transactions.map((t) => ({
      ...t,
      accountType: t.account.type,
      categoryName: resolvedCategories.get(t.id),
    })),
  );
  const rows: ReportRow[] = transactions.map((t) => ({
    id: t.id,
    date: reportDay(t.date, timeZone),
    amount: Math.abs(Number(t.amount)),
    currency: t.currency,
    type: hasTransactionUserEdits(t) ? t.type :
      overrides.get(t.id) ??
      resolveFinancialTransactionType({
        ...t,
        categoryName: resolvedCategories.get(t.id),
        institution: t.account.institution,
      }),
    category: resolvedCategories.get(t.id)!,
    categoryId: t.category?.id,
    merchant: t.merchantClean || t.merchantRaw || "Other",
    accountId: t.accountId,
    account: t.account.name,
    reviewStatus: t.reviewStatus,
    needsReview: transactionNeedsReview({...t,categoryName:resolvedCategories.get(t.id)}),
  }));
  const selected = selectedReportRows(rows, view);
  const earliest =
    selected
      .map((t) => t.date)
      .filter((d) => d <= today)
      .sort()[0] ?? today;
  const period = reportPeriod(view, today, earliest);
  const asOf = getCalendarDayEndInTimeZone(now, timeZone);
  const dayDate = (s: string) => new Date(`${s}T23:59:59.999`);
  const colors = [
    "#08abc4",
    "#35b878",
    "#8771bb",
    "#f5aa38",
    "#e2758c",
    "#6286b7",
  ];
  const reports = (
    view.currency === "ALL" ? currencySelection.currencies : [view.currency]
  ).map((currency) => {
    const analysis = analyzeReport(
      selected.filter((t) => t.currency === currency),
      period,
    );
    const scopedAccounts = accounts.filter(
      (a) =>
        a.currency === currency &&
        (!view.accounts.length || view.accounts.includes(a.id)),
    );
    const snapshot = scopedAccounts.map((a) => {
      const compatible = {
        ...a,
        transactions: a.transactions.map((t) => ({
          ...t,
          amount: String(t.amount),
          rawPayload: t.rawPayload as never,
        })),
      };
      const cash = reportCashMovements(compatible);
      return {
        id: a.id,
        currency: a.currency,
        balance: bankBalances.has(a.id)
          ? normalizeAccountBalanceSign(
              a.type,
              Number(bankBalances.get(a.id)!.bankBalance),
            )
          : reportAccountBalance(compatible),
        cashMovements: cash
          ? {
              ...cash,
              knownFrom: cash.knownFrom
                ? getCalendarDayEndInTimeZone(
                    new Date(cash.knownFrom),
                    timeZone,
                  )
                : null,
              movements: cash.movements.map((m) => ({
                ...m,
                date: m.date
                  ? getCalendarDayEndInTimeZone(new Date(m.date), timeZone)
                  : m.date,
              })),
            }
          : undefined,
      };
    });
    const known = snapshot.filter(
      (a) => a.balance !== null && Number.isFinite(a.balance),
    );
    const movements = transactions.map((t) => ({
      ...t,
      amount: String(t.amount),
      rawPayload: t.rawPayload as never,
      date: getCalendarDayEndInTimeZone(t.date, timeZone),
    }));
    const balances =
      buildReportBalanceSeries(
        known,
        movements,
        dayDate(period.from),
        dayDate(period.to),
        asOf,
      ).find((s) => s.currency === currency)?.points ?? [];
    const history = buildReportNetWorth(
      scopedAccounts,
      currency,
      new Date(period.from),
      dayDate(period.to),
    );
    const goal =
      user.primaryGoal && currency === baseCurrency
        ? getGoalProgressSnapshot(
            {
              goalKey: user.primaryGoal as GoalKey,
              targetAmount:
                user.goalTargetAmount === null
                  ? null
                  : Number(user.goalTargetAmount),
              goalPlan: normalizeGoalPlan(user.goalPlan),
              currentNet: analysis.current.income - analysis.current.expense,
              currentSpend: analysis.current.expense,
              monthlyIncome: analysis.current.income || null,
              currentSavingsRate:
                (savingsRate(
                  analysis.current.income,
                  analysis.current.expense,
                ) ?? 0) / 100,
              previousSavingsRate:
                (savingsRate(
                  analysis.previous.income,
                  analysis.previous.expense,
                ) ?? 0) / 100,
              spendDelta: analysis.previous.expense
                ? ((analysis.current.expense - analysis.previous.expense) /
                    analysis.previous.expense) *
                  100
                : null,
              recurringShare:
                analysis.drivers.recurringTotal /
                Math.max(1, analysis.current.expense),
            },
            currency,
          )
        : null;
    // Beginning balance uses all movements, even when category/review filters narrow the spending view.
    const cashFlow = paid
      ? analysis.accounts.map((a, i) => {
          const account = scopedAccounts.find((x) => x.id === a.id);
          const snap = known.find((x) => x.id === a.id);
          const openingDay = shiftDay(period.from, -1);
          const opening =
            account && snap
              ? buildReportBalanceSeries(
                  [snap],
                  movements,
                  dayDate(openingDay),
                  dayDate(openingDay),
                  asOf,
                )[0]?.points[0]?.balance
              : null;
          return {
            id: a.id,
            label: a.account,
            beginningBalance: Math.max(0, opening ?? 0),
            incomeAmount: a.income,
            color: colors[i % colors.length],
            flows: [
              ...a.destinations.map((d) => ({
                key: d.name,
                label: d.name,
                amount: d.amount,
              })),
              ...(Math.max(0, opening ?? 0) + a.income > a.expense
                ? [
                    {
                      key: "__remaining__",
                      label: "Unspent",
                      amount: Math.max(0, opening ?? 0) + a.income - a.expense,
                    },
                  ]
                : []),
            ],
          };
        })
      : [];
    // Paid data is omitted at the server boundary, not merely hidden in the app.
    if (!paid) {
      analysis.statement = [];
      analysis.trends = [];
      analysis.accounts = [];
      analysis.drivers = { category: null, merchant: null, recurringTotal: 0 };
    }
    return {
      currency,
      analysis,
      balances,
      netWorth: history.points,
      knownAccounts: known.length,
      accountCount: scopedAccounts.length,
      cashFlow,
      goal:
        goal && paid
          ? {
              title: user.primaryGoal!.replaceAll("_", " "),
              detail: goal.nextAction,
              progress: goal.progressPercent,
            }
          : null,
    };
  });
  return {
    workspaceId,
    paid,
    timeZone,
    today,
    view,
    period,
    currencies: currencySelection.currencies,
    accounts: accounts.map((a) => ({ id: a.id, name: a.name })),
    categories: [...new Set(rows.map((r) => r.category))]
      .sort()
      .map((name) => ({
        id: categories.find((c) => c.name === name)?.id ?? "",
        name,
      })),
    reports,
  };
}
