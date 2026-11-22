import {displayRates} from "./display-rates";
import { homeCurrencyScope } from "../../shared/home-currency-scope";
import { buildHomeAdviserInsights } from "../../shared/home-adviser-insights";
import { buildHomeNextSteps } from "./home-next-steps";
import { convertHomeWindow } from "./home-currency-total";
import { finverseBalances } from "./finverse-balances";
import { mobileHomePeriods, homeDateKey } from "./mobile-home-periods";
import { actionableReviewIds } from "./actionable-transaction-review";
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
import { isSpendableAccountType, SPENDABLE_ACCOUNT_TYPES } from "./account-types";
import { resolveFinancialTransactionType } from "./transaction-directions";

// Read-only native dashboard. Reuses Clover's balance/checkpoint and direction
// rules; never totals a paginated list or mixes currencies without conversion.
export async function mobileHome(workspaceId: string, selectedCurrency: string, profileCurrency = "PHP", overviewOnly = false) {
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
    recentEntry,
    allSuggestions,
    bankSnapshots,
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
            account: {
              type: { in: [...SPENDABLE_ACCOUNT_TYPES] },
              ...(allCurrencies ? {} : { currency }),
              OR: [{ source: { in: ["manual", "adviser_manual"] } }, { type: "cash" }],
            },
          },
          select: {
            id: true,
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
        importFileId: true,
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
    overviewOnly ? Promise.resolve(null) : import("./budgeting-data").then(module => module.loadCachedBudgetWorkspaceData(workspaceId, { directory: true })),
    actionableReviewIds({workspaceId,deletedAt:null,...(allCurrencies ? {} : {currency})}).then(ids=>ids.length),
    prisma.transaction.groupBy({
      by: ["currency"],
      where: buildActiveWorkspaceTransactionWhere(workspaceId),
    }),
    prisma.transaction.findFirst({
      where: buildActiveWorkspaceTransactionWhere(workspaceId, {
        createdAt: { gte: new Date(+rolling(7).from) },
        currency,
        reviewStatus: { notIn: ["rejected", "duplicate_skipped"] },
      }),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { date: true },
    }),
    overviewOnly ? Promise.resolve([]) : import("./planned-payment-suggestions").then(module => module.getPlannedPaymentSuggestions(workspaceId)),
    finverseBalances(workspaceId),
  ]);
  const suggestions = allSuggestions.filter(s => allCurrencies || s.currency === currency);
  const spendable = accounts.filter((a) => isSpendableAccountType(a.type) && (allCurrencies || a.currency === currency));
  const rates = await displayRates([...spendable.map((a) => a.currency), ...transactions.map(t => t.currency)], currency);
  const balanceAvailable = spendable.every((a) => rates.has(a.currency));
  const balance = balanceAvailable
    ? spendable.reduce((sum, account) => {
        const checkpoint = selectLatestAccountCheckpoint(
          account.statementCheckpoints,
        );
        const fallback =
          (account.source === "manual" || account.source === "adviser_manual" || account.type === "cash")
            ? deriveReconciledBalance({
                accountType: account.type,
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
                treatStoredBalanceAsOpening: ["manual", "adviser_manual"].includes(account.source),
              })
            : account.balance;
        const effective = bankSnapshots.get(account.id)?.bankBalance ?? resolveEffectiveAccountBalance({
      cashBalanceProjected: account.type === "cash",          accountType: account.type,
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
  // All report boundaries use the same Manila midnight. Index each posting once
  // so adding a day or a currency never requires another ledger scan.
  const dayLength = 86_400_000;
  type Flow = { income: number; expense: number; transfer: number };
  const emptyFlow = (): Flow => ({ income: 0, expense: 0, transfer: 0 });
  const dailyFlows = new Map<string, Map<number, Flow>>();
  for (const transaction of transactions) {
    const type = resolveFinancialTransactionType({ ...transaction, categoryName: transaction.category?.name });
    if (type !== "income" && type !== "expense" && type !== "transfer") continue;
    let days = dailyFlows.get(transaction.currency);
    if (!days) {
      days = new Map();
      dailyFlows.set(transaction.currency, days);
    }
    const index = Math.floor((+transaction.date - +day) / dayLength);
    const flow = days.get(index) ?? emptyFlow();
    flow[type] += Math.abs(Number(transaction.amount));
    days.set(index, flow);
  }
  const totals = (from: Date, to: Date, reportCurrency = currency) => {
    const result = emptyFlow();
    const days = dailyFlows.get(reportCurrency);
    if (days) {
      for (let index = (+from - +day) / dayLength; index < (+to - +day) / dayLength; index++) {
        const flow = days.get(index);
        if (!flow) continue;
        result.income += flow.income;
        result.expense += flow.expense;
        result.transfer += flow.transfer;
      }
    }
    return result;
  };
  const report = (days: number, reportCurrency = currency) => {
    const { from, previousFrom, previousTo } = rolling(days);
    const flows = dailyFlows.get(reportCurrency);
    return {
      ...totals(from, tomorrow, reportCurrency),
      previous: totals(previousFrom, previousTo, reportCurrency),
      days: Array.from({ length: days }, (_, i) => ({
        date: homeDateKey(new Date(+from + i * dayLength)),
        ...(flows?.get(i + 1 - days) ?? emptyFlow()),
      })),
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
  const reportEntries = transactions.filter(t => t.currency === currency && t.date >= rolling(30).from);
  const insightInput = {
      backfilledDate: recentEntry && recentEntry.date < rolling(30).from ? recentEntry.date.toISOString().slice(0,10) : undefined,
      reportEntries: reportEntries.length, importedEntries: reportEntries.filter(t => t.importFileId).length,
      currency,
      hasRecentTransactionActivity: Boolean(recentEntry) || transactions.some(t => t.date >= rolling(7).from),
      categorySpike: spike,
      paymentTitles: suggestions.filter((s) => s.dueDate && +new Date(s.dueDate) <= Date.now() + 7 * 86400000).map((s) => s.title),
      recurringCount,
      weekly,
      previousWeeklyExpense: weekly.previous.expense,
      monthNet: monthTotals.income - monthTotals.expense,
      hasRecentTransactions: transactions.some((t) => t.currency === currency && t.date >= rolling(7).from),
      // Conservatively suppress the all-clear card while any queue item remains.
      recentReviewCount: reviewCount,
  };
  return {
    ...(overviewOnly ? { insightInput, detailsPending: true } : {}),
    insights: buildHomeAdviserInsights(insightInput),
    nextSteps: buildHomeNextSteps({ transactionCount: 0, recurringCount, statementCount: suggestions.filter((s) => s.sourceKind === "statement_reminder").length }),
    currencyReports: (allCurrencies ? currencies : [currency]).map((c) => ({ currency: c, weekly: c === currency ? weekly : report(7, c), monthly: c === currency ? monthly : report(30, c) })),
    heroTotals: { current: convertHomeWindow(transactions, month, tomorrow, Object.fromEntries(rates)), previous: convertHomeWindow(transactions, previousMonth, month, Object.fromEntries(rates)) },
    currencies,
    reviewCount,
    budgets: (budgetData?.overview.budgets ?? []).filter(b => allCurrencies || b.currency === currency).map((b) => ({
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
    month: monthTotals,
    previousMonth: totals(previousMonth, month),
    weekly,
    monthly,
    upcoming,
  };
}

/** Secondary dashboard work is isolated from the first balance/chart response. */
export async function mobileHomeDetails(workspaceId: string, selectedCurrency: string, profileCurrency = "PHP") {
  const { allCurrencies, displayCurrency: currency } = homeCurrencyScope(selectedCurrency, profileCurrency);
  const [budgetData, allSuggestions] = await Promise.all([
    import("./budgeting-data").then(module => module.loadCachedBudgetWorkspaceData(workspaceId, { directory: true })),
    import("./planned-payment-suggestions").then(module => module.getPlannedPaymentSuggestions(workspaceId)),
  ]);
  const suggestions = allSuggestions.filter(s => allCurrencies || s.currency === currency);
  const recurringCount = suggestions.filter(s => s.sourceKind === "recurring_transaction" || s.sourceKind === "installment").length;
  return {
    paymentTitles: suggestions.filter(s => s.dueDate && +new Date(s.dueDate) <= Date.now() + 7 * 86400000).map(s => s.title),
    recurringCount,
    nextSteps: buildHomeNextSteps({ transactionCount: 0, recurringCount, statementCount: suggestions.filter(s => s.sourceKind === "statement_reminder").length }),
    budgets: budgetData.overview.budgets.filter(b => allCurrencies || b.currency === currency).map(b => ({
      id: b.id, name: b.name, currency: b.currency, actualAmount: b.actualAmount, targetAmount: b.targetAmount,
      progressPercent: b.progressPercent, statusLabel: b.statusLabel, periodLabel: b.periodLabel, isAtRisk: b.isAtRisk,
    })),
  };
}
