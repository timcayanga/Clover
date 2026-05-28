import type { BudgetCadence, BudgetKind, BudgetScope, TransactionType } from "@prisma/client";
import { formatCurrencyAmount } from "@/lib/currency-format";

export type BudgetRecord = {
  id: string;
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
  amount: unknown;
  date: Date;
  isExcluded: boolean;
};

export type BudgetAlertStage = "safe" | "watch" | "warning" | "critical" | "exceeded";

export type BudgetProgress = {
  id: string;
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
};

export type BudgetAlert = BudgetProgress & {
  tone: "positive" | "warning" | "danger";
  actionLabel: string;
  href: string;
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
  alerts: BudgetAlert[];
  activeBudgetCount: number;
  totalTargetAmount: number;
  totalActualAmount: number;
  totalProgressPercent: number;
  highestAlert: BudgetProgress | null;
};

const thresholdSteps = [50, 70, 90, 100];

const toAmount = (value: unknown) => Number(value ?? 0);
const budgetSuggestionLookbackDays = 45;
const monthlyEquivalent = (amount: number) => (amount <= 0 ? 0 : amount * (30 / budgetSuggestionLookbackDays));

export const formatBudgetCadenceLabel = (cadence: BudgetCadence) => {
  if (cadence === "daily") return "Daily";
  if (cadence === "weekly") return "Weekly";
  return "Monthly";
};

export const formatBudgetScopeLabel = (scope: BudgetScope, budget: BudgetRecord) => {
  if (scope === "account") {
    return budget.account?.name ?? "Account";
  }

  if (scope === "category") {
    return budget.category?.name ?? "Category";
  }

  return "All accounts";
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

  return new Date(now.getFullYear(), now.getMonth(), 1);
};

export const getBudgetPeriodLabel = (cadence: BudgetCadence) => {
  if (cadence === "daily") return "This day";
  if (cadence === "weekly") return "This week";
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

export const buildBudgetOverview = (params: {
  budgets: BudgetRecord[];
  transactions: BudgetTransaction[];
  now?: Date;
}) => {
  const now = params.now ?? new Date();
  const budgets = params.budgets
    .filter((budget) => budget.isActive)
    .map((budget) => {
      const periodStart = getBudgetPeriodStart(budget.cadence, now);
      const periodTransactions = params.transactions.filter((transaction) => transaction.date >= periodStart && matchesBudgetScope(budget, transaction) && !transaction.isExcluded);
      const spendingTransactions = periodTransactions.filter((transaction) => transaction.type === "expense");
      const incomeTransactions = periodTransactions.filter((transaction) => transaction.type === "income");
      const targetAmount = toAmount(budget.targetAmount);
      const actualAmount =
        budget.kind === "savings_target"
          ? Math.max(incomeTransactions.reduce((sum, transaction) => sum + Math.abs(toAmount(transaction.amount)), 0) -
              spendingTransactions.reduce((sum, transaction) => sum + Math.abs(toAmount(transaction.amount)), 0), 0)
          : spendingTransactions.reduce((sum, transaction) => sum + Math.abs(toAmount(transaction.amount)), 0);
      const progressPercent = targetAmount > 0 ? (actualAmount / targetAmount) * 100 : 0;
      const stage = getBudgetStage(progressPercent);
      const nextThreshold = getBudgetNextThreshold(progressPercent);
      const status = getBudgetStatus(budget.kind, stage);
      const remainingAmount = targetAmount - actualAmount;

      return {
        id: budget.id,
        name: budget.name,
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
        statusDetail: status.detail,
      } satisfies BudgetProgress;
    })
    .sort((left, right) => right.progressPercent - left.progressPercent || left.name.localeCompare(right.name));

  const alerts = budgets
    .filter((budget) => budget.stage !== "safe")
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
    alerts,
    activeBudgetCount: budgets.length,
    totalTargetAmount,
    totalActualAmount,
    totalProgressPercent,
    highestAlert: budgets[0] ?? null,
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
