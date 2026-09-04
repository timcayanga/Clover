import type { BudgetCadence, BudgetKind, BudgetScope, CommitmentKind, CommitmentStatus, TransactionType } from "@prisma/client";
import { formatCurrencyAmount } from "@/lib/currency-format";
import { resolveFinancialTransactionType } from "@/lib/transaction-directions";

export type BudgetRecord = {
  id: string;
  emoji?: string | null;
  planId?: string | null;
  name: string;
  kind: BudgetKind;
  scope: BudgetScope;
  cadence: BudgetCadence;
  targetAmount: unknown;
  currency: string;
  isActive: boolean;
  accountId: string | null;
  categoryId: string | null;
  account?: {
    name: string;
    currency: string | null;
  } | null;
  category?: {
    name: string;
  } | null;
};

export type BudgetTransaction = {
  accountId: string;
  categoryId: string | null;
  type: TransactionType;
  isTransfer?: boolean;
  category?: { name: string } | null;
  amount: unknown;
  date: Date;
  isExcluded: boolean;
};

export type BudgetCommitment = {
  amount: unknown;
  currency: string;
  accountId: string | null;
  dueDate: Date | null;
  nextDueDate: Date | null;
  kind: CommitmentKind;
  status: CommitmentStatus;
};

export type BudgetAlertStage = "safe" | "watch" | "warning" | "critical" | "exceeded";

export type BudgetProgress = {
  id: string;
  emoji?: string | null;
  planId: string | null;
  name: string;
  kind: BudgetKind;
  scope: BudgetScope;
  cadence: BudgetCadence;
  currency: string;
  targetAmount: number;
  actualAmount: number;
  progressPercent: number;
  remainingAmount: number;
  stage: BudgetAlertStage;
  scopeLabel: string;
  periodLabel: string;
  nextThreshold: number | null;
  accountId: string | null;
  accountName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  kindLabel: string;
  statusLabel: string;
  statusDetail: string;
  isAtRisk: boolean;
  plannedAmount: number;
  plannedCount: number;
  projectedAmount: number;
  projectedProgressPercent: number;
  isActive: boolean;
};

export type BudgetAlert = BudgetProgress & {
  tone: "positive" | "warning" | "danger";
  actionLabel: string;
  href: string;
};

export type BudgetHistoryPoint = {
  label: string;
  periodStart: string;
  periodEnd: string;
  actualAmount: number;
  targetAmount: number;
  progressPercent: number;
  stage: BudgetAlertStage;
};

export type BudgetHistoryTransaction = {
  id: string;
  date: string;
  amount: number;
  type: TransactionType;
  merchantName: string;
  categoryName: string | null;
};

export type BudgetHistory = {
  points: BudgetHistoryPoint[];
  recentTransactions: BudgetHistoryTransaction[];
};

export type BudgetSuggestion = {
  id: string;
  title: string;
  detail: string;
  amount: number;
  currency: string;
  kind: BudgetKind;
  scope: BudgetScope;
  cadence: BudgetCadence;
  accountId: string | null;
  categoryId: string | null;
  actionLabel: string;
  tone: "positive" | "warning" | "neutral";
};

export type BudgetOverview = {
  budgets: BudgetProgress[];
  inactiveBudgets: BudgetProgress[];
  alerts: BudgetAlert[];
  activeBudgetCount: number;
  totalTargetAmount: number;
  totalActualAmount: number;
  totalProgressPercent: number;
  highestAlert: BudgetProgress | null;
  uncategorizedTransactionCount: number;
  uncategorizedAmount: number;
};

const thresholdSteps = [50, 70, 90, 100];
const budgetHistoryPointCount = 6;

const toAmount = (value: unknown) => Number(value ?? 0);
const budgetSuggestionLookbackDays = 45;
const monthlyEquivalent = (amount: number) => (amount <= 0 ? 0 : amount * (30 / budgetSuggestionLookbackDays));

export const formatBudgetCadenceLabel = (cadence: BudgetCadence) => {
  if (cadence === "daily") return "Daily";
  if (cadence === "weekly") return "Weekly";
  if (cadence === "biweekly") return "Every 2 weeks";
  if (cadence === "quarterly") return "Quarterly";
  if (cadence === "annual") return "Yearly";
  return "Monthly";
};

export const formatBudgetScopeLabel = (scope: BudgetScope, budget: BudgetRecord) => {
  if (scope === "account") {
    return budget.account?.name ?? "Account";
  }

  if (scope === "category") {
    return budget.category?.name ?? "Category";
  }

  return "All spending";
};

export const formatBudgetKindLabel = (kind: BudgetKind) => (kind === "savings_target" ? "Savings target" : "Spend limit");

export const getBudgetPeriodStart = (cadence: BudgetCadence, now = new Date()) => {
  if (cadence === "daily") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  if (cadence === "weekly") {
    const day = now.getDay();
    const daysSinceMonday = (day + 6) % 7;
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday);
  }

  if (cadence === "biweekly") {
    return getBiweeklyPeriodStart(now);
  }

  if (cadence === "quarterly") {
    return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  }

  if (cadence === "annual") {
    return new Date(now.getFullYear(), 0, 1);
  }

  return new Date(now.getFullYear(), now.getMonth(), 1);
};

export const getBudgetPeriodLabel = (cadence: BudgetCadence) => {
  if (cadence === "daily") return "This day";
  if (cadence === "weekly") return "This week";
  if (cadence === "biweekly") return "These 2 weeks";
  if (cadence === "quarterly") return "This quarter";
  if (cadence === "annual") return "This year";
  return "This month";
};

export const getBudgetStage = (progressPercent: number): BudgetAlertStage => {
  if (progressPercent >= 100) return "exceeded";
  if (progressPercent >= 90) return "critical";
  if (progressPercent >= 70) return "warning";
  if (progressPercent >= 50) return "watch";
  return "safe";
};

export const getBudgetNextThreshold = (progressPercent: number) => thresholdSteps.find((step) => progressPercent < step) ?? null;

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const startOfWeek = (date: Date) => {
  const day = date.getDay();
  const daysSinceMonday = (day + 6) % 7;
  return startOfDay(new Date(date.getFullYear(), date.getMonth(), date.getDate() - daysSinceMonday));
};
const getBiweeklyPeriodStart = (date: Date) => {
  const base = new Date(1970, 0, 5);
  const dayMs = 24 * 60 * 60 * 1000;
  const dateIndex = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / dayMs);
  const baseIndex = Math.floor(Date.UTC(base.getFullYear(), base.getMonth(), base.getDate()) / dayMs);
  const periodOffset = Math.floor((dateIndex - baseIndex) / 14) * 14;
  return addDays(base, periodOffset);
};
const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const addMonths = (date: Date, months: number) => new Date(date.getFullYear(), date.getMonth() + months, 1);

const getPeriodStart = (cadence: BudgetCadence, offset: number, now: Date) => {
  if (cadence === "daily") {
    return addDays(startOfDay(now), -offset);
  }

  if (cadence === "weekly") {
    return addDays(startOfWeek(now), -offset * 7);
  }

  if (cadence === "biweekly") {
    return addDays(getBiweeklyPeriodStart(now), -offset * 14);
  }

  if (cadence === "quarterly") {
    return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 - offset * 3, 1);
  }

  if (cadence === "annual") {
    return new Date(now.getFullYear() - offset, 0, 1);
  }

  return addMonths(startOfMonth(now), -offset);
};

const getPeriodEnd = (cadence: BudgetCadence, start: Date) => {
  if (cadence === "daily") {
    return addDays(start, 1);
  }

  if (cadence === "weekly") {
    return addDays(start, 7);
  }

  if (cadence === "biweekly") {
    return addDays(start, 14);
  }

  if (cadence === "quarterly") {
    return addMonths(start, 3);
  }

  if (cadence === "annual") {
    return new Date(start.getFullYear() + 1, 0, 1);
  }

  return addMonths(start, 1);
};

const formatHistoryLabel = (cadence: BudgetCadence, start: Date, end: Date) => {
  const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  });
  const monthYearFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
  });

  if (cadence === "daily") {
    return shortDateFormatter.format(start);
  }

  if (cadence === "weekly") {
    return `${shortDateFormatter.format(start)} - ${shortDateFormatter.format(addDays(end, -1))}`;
  }

  if (cadence === "biweekly") {
    return `${shortDateFormatter.format(start)} - ${shortDateFormatter.format(addDays(end, -1))}`;
  }

  if (cadence === "quarterly") {
    return `Q${Math.floor(start.getMonth() / 3) + 1} ${start.getFullYear()}`;
  }

  if (cadence === "annual") {
    return String(start.getFullYear());
  }

  return monthYearFormatter.format(start);
};

const getBudgetActualAmount = (kind: BudgetKind, transactions: BudgetTransaction[]) => {
  const getType = (transaction: BudgetTransaction) =>
    resolveFinancialTransactionType({
      type: transaction.type,
      amount: transaction.amount,
      isTransfer: transaction.isTransfer,
      categoryName: transaction.category?.name,
    });
  const spendingTransactions = transactions.filter((transaction) => getType(transaction) === "expense");
  const incomeTransactions = transactions.filter((transaction) => getType(transaction) === "income");

  if (kind === "savings_target") {
    return Math.max(
      incomeTransactions.reduce((sum, transaction) => sum + Math.abs(toAmount(transaction.amount)), 0) -
        spendingTransactions.reduce((sum, transaction) => sum + Math.abs(toAmount(transaction.amount)), 0),
      0
    );
  }

  return spendingTransactions.reduce((sum, transaction) => sum + Math.abs(toAmount(transaction.amount)), 0);
};

const getBudgetElapsedPercent = (cadence: BudgetCadence, now: Date) => {
  const periodStart = getBudgetPeriodStart(cadence, now);
  const periodEnd = getPeriodEnd(cadence, periodStart);
  const periodLength = periodEnd.getTime() - periodStart.getTime();
  if (periodLength <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, ((now.getTime() - periodStart.getTime()) / periodLength) * 100));
};

const getBudgetPaceLabel = (kind: BudgetKind, progressPercent: number, cadence: BudgetCadence, now: Date) => {
  const elapsedPercent = getBudgetElapsedPercent(cadence, now);
  const paceDifference = progressPercent - elapsedPercent;

  if (paceDifference >= 15) {
    return kind === "savings_target" ? "Ahead of pace" : "Running hot";
  }

  if (paceDifference <= -15) {
    return kind === "savings_target" ? "Behind pace" : "Ahead of pace";
  }

  return "On pace";
};

const getBudgetStatus = (kind: BudgetKind, stage: BudgetAlertStage) => {
  if (kind === "savings_target") {
    if (stage === "exceeded") return { label: "Target reached", detail: "You are over the target pace.", tone: "positive" as const };
    if (stage === "critical") return { label: "Close to target", detail: "You are nearly at the savings target.", tone: "warning" as const };
    if (stage === "warning") return { label: "Building", detail: "Savings are building but not quite there yet.", tone: "warning" as const };
    if (stage === "watch") return { label: "Getting started", detail: "The target is still within reach.", tone: "positive" as const };
    return { label: "On track", detail: "The target still has room.", tone: "positive" as const };
  }

  if (stage === "exceeded") return { label: "Limit exceeded", detail: "The budget has been crossed.", tone: "danger" as const };
  if (stage === "critical") return { label: "At the limit", detail: "You are almost at the ceiling.", tone: "danger" as const };
  if (stage === "warning") return { label: "Getting tight", detail: "Spending is moving toward the cap.", tone: "warning" as const };
  if (stage === "watch") return { label: "Halfway there", detail: "The budget is over halfway used.", tone: "warning" as const };
  return { label: "Room left", detail: "There is still room in this budget.", tone: "positive" as const };
};

const matchesBudgetScope = (budget: BudgetRecord, transaction: BudgetTransaction) => {
  if (budget.scope === "account") {
    return transaction.accountId === budget.accountId;
  }

  if (budget.scope === "category") {
    return budget.categoryId !== null && transaction.categoryId === budget.categoryId;
  }

  return true;
};

export const buildBudgetHistory = (
  budget: BudgetRecord,
  transactions: Array<
    BudgetTransaction & {
      id: string;
      merchantRaw?: string | null;
      merchantClean?: string | null;
      description?: string | null;
      categoryName?: string | null;
    }
  >,
  now = new Date(),
  pointCount = budgetHistoryPointCount
): BudgetHistory => {
  const targetAmount = toAmount(budget.targetAmount);
  const points: BudgetHistoryPoint[] = [];

  for (let offset = pointCount - 1; offset >= 0; offset -= 1) {
    const periodStart = getPeriodStart(budget.cadence, offset, now);
    const periodEnd = getPeriodEnd(budget.cadence, periodStart);
    const matchingTransactions = transactions.filter(
      (transaction) => transaction.date >= periodStart && transaction.date < periodEnd && matchesBudgetScope(budget, transaction) && !transaction.isExcluded
    );
    const actualAmount = getBudgetActualAmount(budget.kind, matchingTransactions);
    const progressPercent = targetAmount > 0 ? (actualAmount / targetAmount) * 100 : 0;

    points.push({
      label: formatHistoryLabel(budget.cadence, periodStart, periodEnd),
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      actualAmount,
      targetAmount,
      progressPercent,
      stage: getBudgetStage(progressPercent),
    });
  }

  const recentTransactions = [...transactions]
    .filter((transaction) => matchesBudgetScope(budget, transaction) && !transaction.isExcluded)
    .sort((left, right) => right.date.getTime() - left.date.getTime())
    .slice(0, 8)
    .map((transaction) => ({
      id: transaction.id,
      date: transaction.date.toISOString(),
      amount: Math.abs(toAmount(transaction.amount)),
      type: transaction.type,
      merchantName: (transaction.merchantClean ?? transaction.merchantRaw ?? transaction.description ?? "Transaction").trim(),
      categoryName: transaction.categoryName ?? null,
    }));

  return {
    points,
    recentTransactions,
  };
};

export const buildBudgetOverview = (params: {
  budgets: BudgetRecord[];
  transactions: BudgetTransaction[];
  commitments?: BudgetCommitment[];
  now?: Date;
}) => {
  const now = params.now ?? new Date();
  const commitments = params.commitments ?? [];
  const currentMonthStart = startOfMonth(now);
  const uncategorizedTransactions = params.transactions.filter(
    (transaction) =>
      transaction.type === "expense" &&
      transaction.categoryId === null &&
      transaction.date >= currentMonthStart &&
      !transaction.isExcluded
  );
  const allBudgets = params.budgets
    .map((budget) => {
      const periodStart = getBudgetPeriodStart(budget.cadence, now);
      const periodEnd = getPeriodEnd(budget.cadence, periodStart);
      const periodTransactions = params.transactions.filter(
        (transaction) =>
          transaction.date >= periodStart &&
          transaction.date < periodEnd &&
          matchesBudgetScope(budget, transaction) &&
          !transaction.isExcluded
      );
      const periodCommitments = budget.kind === "savings_target" || budget.scope === "category" ? [] : commitments.filter((commitment) => {
        const dueDate = commitment.nextDueDate ?? commitment.dueDate;
        return commitment.status === "active" && dueDate !== null && dueDate >= periodStart && dueDate < periodEnd &&
          commitment.currency.toUpperCase() === budget.currency.toUpperCase() &&
          (budget.scope !== "account" || commitment.accountId === budget.accountId);
      });
      const plannedAmount = periodCommitments.reduce((sum, commitment) => sum + Math.abs(toAmount(commitment.amount)), 0);
      const targetAmount = toAmount(budget.targetAmount);
      const actualAmount = getBudgetActualAmount(budget.kind, periodTransactions);
      const progressPercent = targetAmount > 0 ? (actualAmount / targetAmount) * 100 : 0;
      const projectedAmount = budget.kind === "savings_target" ? actualAmount : actualAmount + plannedAmount;
      const projectedProgressPercent = targetAmount > 0 ? (projectedAmount / targetAmount) * 100 : 0;
      const stage = getBudgetStage(progressPercent);
      const nextThreshold = getBudgetNextThreshold(progressPercent);
      const status = getBudgetStatus(budget.kind, stage);
      const paceLabel = getBudgetPaceLabel(budget.kind, progressPercent, budget.cadence, now);
      const isAtRisk = budget.kind === "savings_target" ? paceLabel === "Behind pace" : stage !== "safe";
      const remainingAmount = targetAmount - actualAmount;

      return {
        id: budget.id,
        planId: budget.planId ?? null,
        name: budget.name,
        emoji: budget.emoji ?? null,
        kind: budget.kind,
        scope: budget.scope,
        cadence: budget.cadence,
        currency: budget.currency,
        targetAmount,
        actualAmount,
        progressPercent,
        remainingAmount,
        stage,
        scopeLabel: formatBudgetScopeLabel(budget.scope, budget),
        periodLabel: getBudgetPeriodLabel(budget.cadence),
        nextThreshold,
        accountId: budget.accountId,
        accountName: budget.account?.name ?? null,
        categoryId: budget.categoryId,
        categoryName: budget.category?.name ?? null,
        kindLabel: formatBudgetKindLabel(budget.kind),
        statusLabel: status.label,
        statusDetail: `${status.detail} ${paceLabel}.`,
        isAtRisk,
        plannedAmount,
        plannedCount: periodCommitments.length,
        projectedAmount,
        projectedProgressPercent,
        isActive: budget.isActive,
      } satisfies BudgetProgress;
    })
    .sort((left, right) => right.progressPercent - left.progressPercent || left.name.localeCompare(right.name));

  const budgets = allBudgets.filter((budget) => budget.isActive);
  const inactiveBudgets = allBudgets.filter((budget) => !budget.isActive);

  const alerts = budgets
    .filter((budget) => budget.isAtRisk)
    .map((budget) => {
      const tone = budget.stage === "exceeded" || budget.stage === "critical" ? "danger" : "warning";
      const actionLabel = budget.scope === "category" ? "Review category spend" : budget.scope === "account" ? "Check account activity" : "Open budgeting";
      return {
        ...budget,
        tone,
        actionLabel,
        href: "/budgeting",
      } satisfies BudgetAlert;
    });

  const totalTargetAmount = budgets.reduce((sum, budget) => sum + budget.targetAmount, 0);
  const totalActualAmount = budgets.reduce((sum, budget) => sum + budget.actualAmount, 0);
  const totalProgressPercent = totalTargetAmount > 0 ? (totalActualAmount / totalTargetAmount) * 100 : 0;

  return {
    budgets,
    inactiveBudgets,
    alerts,
    activeBudgetCount: budgets.length,
    totalTargetAmount,
    totalActualAmount,
    totalProgressPercent,
    highestAlert: budgets[0] ?? null,
    uncategorizedTransactionCount: uncategorizedTransactions.length,
    uncategorizedAmount: uncategorizedTransactions.reduce((sum, transaction) => sum + Math.abs(toAmount(transaction.amount)), 0),
  } satisfies BudgetOverview;
};

const groupExpenseTotals = (
  transactions: BudgetTransaction[],
  key: "accountId" | "categoryId"
) => {
  const totals = new Map<string, number>();

  for (const transaction of transactions) {
    if (transaction.type !== "expense" || transaction.isExcluded) {
      continue;
    }

    const groupId = transaction[key];
    if (!groupId) {
      continue;
    }

    totals.set(groupId, (totals.get(groupId) ?? 0) + Math.abs(toAmount(transaction.amount)));
  }

  return [...totals.entries()].sort((left, right) => right[1] - left[1]);
};

export const buildBudgetSuggestions = (params: {
  transactions: BudgetTransaction[];
  accounts: Array<{ id: string; name: string; currency: string | null }>;
  categories: Array<{ id: string; name: string }>;
  currency?: string;
}) => {
  const accountCurrencies = new Set(
    params.accounts.map((account) => account.currency?.trim().toUpperCase()).filter((value): value is string => Boolean(value))
  );
  if (accountCurrencies.size > 1) {
    return [];
  }

  const currency = params.currency ?? params.accounts.find((account) => account.currency)?.currency ?? "PHP";
  const totalIncome = params.transactions
    .filter((transaction) => transaction.type === "income" && !transaction.isExcluded)
    .reduce((sum, transaction) => sum + Math.abs(toAmount(transaction.amount)), 0);
  const totalExpenses = params.transactions
    .filter((transaction) => transaction.type === "expense" && !transaction.isExcluded)
    .reduce((sum, transaction) => sum + Math.abs(toAmount(transaction.amount)), 0);
  const netSaved = Math.max(totalIncome - totalExpenses, 0);

  const categoryMap = new Map(params.categories.map((category) => [category.id, category.name]));
  const accountMap = new Map(params.accounts.map((account) => [account.id, account.name]));

  const suggestions: BudgetSuggestion[] = [];
  if (totalExpenses > 0) {
    const globalLimit = Math.max(1, Math.round(monthlyEquivalent(totalExpenses) * 1.05));
    suggestions.push({
      id: "global-spend-limit",
      title: "Set a global spending limit",
      detail: `Your recent spending works out to about ${formatCurrencyAmount(monthlyEquivalent(totalExpenses), currency)} a month.`,
      amount: globalLimit,
      currency,
      kind: "spend_limit",
      scope: "global",
      cadence: "monthly",
      accountId: null,
      categoryId: null,
      actionLabel: "Use as budget",
      tone: "positive",
    });
  }

  const topCategory = groupExpenseTotals(params.transactions, "categoryId")[0];
  const topAccount = groupExpenseTotals(params.transactions, "accountId")[0];

  if (topCategory) {
    const [categoryId, amount] = topCategory;
    const categoryName = categoryMap.get(categoryId);

    if (categoryName && amount > 0) {
      const monthlyAmount = Math.max(1, Math.round(monthlyEquivalent(amount) * 1.05));
      suggestions.push({
        id: `category-${categoryId}`,
        title: `Cap ${categoryName}`,
        detail: `Recent category spend works out to about ${formatCurrencyAmount(monthlyEquivalent(amount), currency)} a month.`,
        amount: monthlyAmount,
        currency,
        kind: "spend_limit",
        scope: "category",
        cadence: "monthly",
        accountId: null,
        categoryId,
        actionLabel: "Use as budget",
        tone: "warning",
      });
    }
  }

  if (topAccount) {
    const [accountId, amount] = topAccount;
    const accountName = accountMap.get(accountId);

    if (accountName && amount > 0) {
      const monthlyAmount = Math.max(1, Math.round(monthlyEquivalent(amount) * 1.05));
      suggestions.push({
        id: `account-${accountId}`,
        title: `Watch ${accountName}`,
        detail: `This account averages about ${formatCurrencyAmount(monthlyEquivalent(amount), currency)} a month in spending.`,
        amount: monthlyAmount,
        currency,
        kind: "spend_limit",
        scope: "account",
        cadence: "monthly",
        accountId,
        categoryId: null,
        actionLabel: "Use as budget",
        tone: "neutral",
      });
    }
  }

  if (netSaved > 0) {
    const monthlySavingsTarget = Math.max(1, Math.round(monthlyEquivalent(netSaved)));
    suggestions.push({
      id: "savings-target",
      title: "Set a savings target",
      detail: `You held onto about ${formatCurrencyAmount(monthlyEquivalent(netSaved), currency)} a month after spending.`,
      amount: monthlySavingsTarget,
      currency,
      kind: "savings_target",
      scope: "global",
      cadence: "monthly",
      accountId: null,
      categoryId: null,
      actionLabel: "Start target",
      tone: "positive",
    });
  }

  return suggestions.slice(0, 4);
};
