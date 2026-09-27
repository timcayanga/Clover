import { homeCurrencyScope } from "../../shared/home-currency-scope";
import { buildHomeAdviserInsights } from "../../shared/home-adviser-insights";
import { buildHomeNextSteps } from "./home-next-steps";
import { getPlannedPaymentSuggestions } from "./planned-payment-suggestions";
import { convertHomeWindow } from "./home-currency-total";
import { finverseBalances } from "./finverse-balances";
import { mobileHomePeriods, homeDateKey } from "./mobile-home-periods";
import { buildReviewQueueWhere } from "./review-queue";
import { loadCachedBudgetWorkspaceData } from "./budgeting-data";
import { serializeFinancialCommitment } from "./commitments";
import { mobileHomePayments } from "./mobile-home-payments";
import { prisma } from "./prisma";
import { buildActiveWorkspaceTransactionWhere } from "./transaction-query";
import {
  deriveReconciledBalance,
  normalizeAccountBalanceSign,
  type BalanceLikeTransaction,
} from "./account-balance";
import {
  resolveEffectiveAccountBalance,
  selectLatestAccountCheckpoint,
} from "./account-balance-projection";
import { isSpendableAccountType } from "./account-types";
import { resolveFinancialTransactionType } from "./transaction-directions";

// Read-only native dashboard. Reuses Clover's balance/checkpoint and direction
// rules; never totals a paginated list or mixes currencies without conversion.
export async function mobileHome(workspaceId: string, selectedCurrency: string, profileCurrency = "PHP") {
  const { allCurrencies, displayCurrency: currency } = homeCurrencyScope(selectedCurrency, profileCurrency);
  const { day, tomorrow, month, previousMonth, rolling } = mobileHomePeriods();
  const since = new Date(+day - 90 * 86400000);
  const [
    accounts,
    transactions,
    commitments,
    budgetData,
    reviewCount,
    reportCurrencies,
    latestImport,
    allSuggestions,
  ] = await Promise.all([
    prisma.account.findMany({
      where: { workspaceId },
      select: {
        id: true,
        type: true,
        currency: true,
        balance: true,
        source: true,
        transactions: {
          where: {
            deletedAt: null,
            isExcluded: false,
            account: { source: "manual" },
          },
          select: {
            amount: true,
            currency: true,
            type: true,
            isExcluded: true,
            merchantRaw: true,
            merchantClean: true,
            description: true,
            date: true,
            createdAt: true,
            rawPayload: true,
          },
        },
        statementCheckpoints: {
          select: {
            endingBalance: true,
            status: true,
            statementEndDate: true,
            createdAt: true,
            sourceMetadata: true,
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        },
      },
    }),
    prisma.transaction.findMany({
      where: buildActiveWorkspaceTransactionWhere(workspaceId, {
        date: { gte: since, lt: tomorrow },
        ...(allCurrencies ? {} : { currency }),
      }),
      select: {
        currency: true,
        date: true,
        amount: true,
        type: true,
        isTransfer: true,
        reviewStatus: true,
        category: { select: { name: true } },
      },
    }),
    prisma.financialCommitment.findMany({
      where: { workspaceId, status: "active", ...(allCurrencies ? {} : { currency }) },
      include: { occurrences: { select: { dueDate: true } } },
    }),
    loadCachedBudgetWorkspaceData(workspaceId, { directory: true }),
    prisma.transaction.count({ where: { AND: [buildReviewQueueWhere(workspaceId), ...(allCurrencies ? [] : [{ currency }])] } }),
    prisma.transaction.findMany({
      where: buildActiveWorkspaceTransactionWhere(workspaceId),
      distinct: ["currency"],
      select: { currency: true },
    }),
    prisma.importFile.findFirst({ where: { workspaceId }, orderBy: { uploadedAt: "desc" }, select: { uploadedAt: true } }),
    getPlannedPaymentSuggestions(workspaceId),
  ]);
  const suggestions = allSuggestions.filter(s => allCurrencies || s.currency === currency);
  const bankSnapshots = await finverseBalances(workspaceId);
  const spendable = accounts.filter((a) => isSpendableAccountType(a.type) && (allCurrencies || a.currency === currency));
  const rates = new Map<string, number>();
  rates.set(currency, 1);
  await Promise.all(
    [...new Set([...spendable.map((a) => a.currency), ...transactions.map(t => t.currency)])]
      .filter((c) => c !== currency)
      .map(async (base) => {
        try {
          const response = await fetch(
            `https://api.frankfurter.dev/v2/rates?base=${encodeURIComponent(base)}&quotes=${currency}`,
            { next: { revalidate: 21600 }, signal: AbortSignal.timeout(5000) },
          );
          if (!response.ok) return;
          const result = (await response.json()) as { rate: number }[];
          if (Number.isFinite(result[0]?.rate) && result[0].rate > 0)
            rates.set(base, result[0].rate);
        } catch {
          /* Missing FX is unavailable, never zero. */
        }
      }),
  );
  const balanceAvailable = spendable.every((a) => rates.has(a.currency));
  const balance = balanceAvailable
    ? spendable.reduce((sum, account) => {
        const checkpoint = selectLatestAccountCheckpoint(
          account.statementCheckpoints,
        );
        const fallback =
          account.source === "manual"
            ? deriveReconciledBalance({
                balance: account.balance?.toString() ?? null,
                transactions: (account.type === "cash"
                  ? account.transactions.filter(
                      (t) => t.currency === account.currency,
                    )
                  : account.transactions
                ).map((t) => ({
                  ...t,
                  amount: t.amount.toString(),
                  rawPayload:
                    t.rawPayload &&
                    typeof t.rawPayload === "object" &&
                    !Array.isArray(t.rawPayload)
                      ? (t.rawPayload as BalanceLikeTransaction["rawPayload"])
                      : null,
                })),
                checkpoints: checkpoint
                  ? [
                      {
                        ...checkpoint,
                        endingBalance:
                          checkpoint.endingBalance?.toString() ?? null,
                      },
                    ]
                  : [],
                treatStoredBalanceAsOpening: true,
              })
            : account.balance;
        const effective = bankSnapshots.get(account.id)?.bankBalance ?? resolveEffectiveAccountBalance({
          accountType: account.type,
          liveBalance: fallback,
          checkpointStatus: checkpoint?.status ?? null,
          checkpointBalance: checkpoint?.endingBalance ?? null,
        });
        return (
          sum +
          Math.max(
            0,
            normalizeAccountBalanceSign(
              account.type,
              Number(effective ?? account.balance ?? 0),
            ),
          ) *
            (rates.get(account.currency) ?? 0)
        );
      }, 0)
    : null;
  const totals = (from: Date, to: Date, reportCurrency = currency) =>
    transactions
      .filter((t) => t.currency === reportCurrency && t.date >= from && t.date < to)
      .reduce(
        (sum, t) => {
          const type = resolveFinancialTransactionType({
            ...t,
            categoryName: t.category?.name,
          });
          if (type === "income" || type === "expense" || type === "transfer")
            sum[type] += Math.abs(Number(t.amount));
          return sum;
        },
        { income: 0, expense: 0, transfer: 0 },
      );
  const report = (days: number, reportCurrency = currency) => {
    const { from, previousFrom, previousTo } = rolling(days);
    return {
      ...totals(from, tomorrow, reportCurrency),
      previous: totals(previousFrom, previousTo, reportCurrency),
      days: Array.from({ length: days }, (_, i) => {
        const date = new Date(+from + i * 86400000);
        return {
          date: homeDateKey(date),
          ...totals(date, new Date(+date + 86400000), reportCurrency),
        };
      }),
    };
  };
  const { upcoming, overdue } = mobileHomePayments(
    commitments.map(serializeFinancialCommitment),
    new Map(
      commitments.map((c) => [
        c.id,
        new Set(c.occurrences.map((o) => o.dueDate.toISOString().slice(0, 10))),
      ]),
    ),
    homeDateKey(day),
  );
  const categories = new Map<string, number>();
  for (const t of transactions) {
    if (
      t.currency !== currency || t.date < month ||
      resolveFinancialTransactionType({
        ...t,
        categoryName: t.category?.name,
      }) !== "expense"
    )
      continue;
    const name = t.category?.name ?? "Uncategorized";
    categories.set(
      name,
      (categories.get(name) ?? 0) + Math.abs(Number(t.amount)),
    );
  }
  const recurringCount = suggestions.filter((s) => s.sourceKind === "recurring_transaction" || s.sourceKind === "installment").length;
  const thirty = rolling(30);
  const categoryDeltas = new Map<string, { current: number; previous: number }>();
  for (const t of transactions) {
    if (t.currency !== currency || t.date < thirty.previousFrom || resolveFinancialTransactionType({ ...t, categoryName: t.category?.name }) !== "expense") continue;
    const name = t.category?.name ?? "Uncategorized";
    const entry = categoryDeltas.get(name) ?? { current: 0, previous: 0 };
    entry[t.date >= thirty.from ? "current" : "previous"] += Math.abs(Number(t.amount));
    categoryDeltas.set(name, entry);
  }
  const monthly = report(30);
  const weekly = report(7);
  const spike = [...categoryDeltas].map(([name, v]) => ({ name, delta: v.current - v.previous, ...v }))
    .filter((v) => v.delta >= Math.max(500, monthly.expense * 0.08) && (v.previous === 0 || v.delta / v.previous >= 0.25))
    .sort((a, b) => b.delta - a.delta || b.current - a.current)[0] ?? null;
  const monthTotals = totals(month, tomorrow);
  const currencies = [...new Set([currency, ...accounts.map((a) => a.currency), ...reportCurrencies.map((t) => t.currency)])].sort();
  return {
    insights: buildHomeAdviserInsights({
      currency,
      daysSinceLastImport: latestImport ? Math.max(0, Math.floor((Date.now() - +latestImport.uploadedAt) / 86400000)) : null,
      categorySpike: spike,
      paymentTitles: suggestions.filter((s) => s.dueDate && +new Date(s.dueDate) <= Date.now() + 7 * 86400000).map((s) => s.title),
      recurringCount,
      weekly,
      previousWeeklyExpense: weekly.previous.expense,
      monthNet: monthTotals.income - monthTotals.expense,
      hasRecentTransactions: transactions.some((t) => t.currency === currency && t.date >= rolling(7).from),
      // Conservatively suppress the all-clear card while any queue item remains.
      recentReviewCount: reviewCount,
    }),
    nextSteps: buildHomeNextSteps({ transactionCount: reviewCount, recurringCount, statementCount: suggestions.filter((s) => s.sourceKind === "statement_reminder").length }),
    currencyReports: (allCurrencies ? currencies : [currency]).map((c) => ({ currency: c, weekly: report(7, c), monthly: report(30, c) })),
    heroTotals: { current: convertHomeWindow(transactions, month, tomorrow, Object.fromEntries(rates)), previous: convertHomeWindow(transactions, previousMonth, month, Object.fromEntries(rates)) },
    currencies,
    reviewCount,
    budgets: budgetData.overview.budgets.filter(b => allCurrencies || b.currency === currency).map((b) => ({
      id: b.id,
      name: b.name,
      currency: b.currency,
      actualAmount: b.actualAmount,
      targetAmount: b.targetAmount,
      progressPercent: b.progressPercent,
      statusLabel: b.statusLabel,
      periodLabel: b.periodLabel,
      isAtRisk: b.isAtRisk,
    })),
    categories: [...categories]
      .sort((a, b) => b[1] - a[1])
      .map(([name, amount]) => ({ name, amount })),
    currency,
    balance,
    overdue,
    month: totals(month, tomorrow),
    previousMonth: totals(previousMonth, month),
    weekly,
    monthly,
    upcoming,
  };
}
