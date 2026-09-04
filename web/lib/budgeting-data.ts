import { prisma } from "@/lib/prisma";
import { buildBudgetOverview, buildBudgetSuggestions, getBudgetPeriodStart, type BudgetRecord } from "@/lib/budgeting";
import { buildActiveWorkspaceTransactionWhere } from "@/lib/transaction-query";
import { isInvestmentAccountOption } from "@/lib/account-option-label";

export const budgetLookbackDays = 400;

export const getBudgetLookbackStart = (now = new Date()) => new Date(now.getTime() - budgetLookbackDays * 24 * 60 * 60 * 1000);

export const isMissingBudgetTableError = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  (((error as { code?: string }).code === "P2021") ||
    (error instanceof Error && /(?:public\.)?Budget.*does not exist|table .*Budget.*does not exist/i.test(error.message)));

// Include paused budgets and the monthly uncategorized warning, even for daily budgets.
export const getBudgetDirectoryStart = (budgets: Pick<BudgetRecord, "cadence">[], now = new Date()) =>
  new Date(Math.min(getBudgetPeriodStart("monthly", now).getTime(), ...budgets.map((budget) => getBudgetPeriodStart(budget.cadence, now).getTime())));

export const loadBudgetEditorOptions = async (workspaceId: string) => {
  const [categories, accounts] = await Promise.all([
    prisma.category.findMany({ where: { workspaceId, type: "expense" }, select: { id: true, name: true, isArchived: true }, orderBy: [{ isArchived: "asc" }, { name: "asc" }] }),
    prisma.account.findMany({
      where: { workspaceId, type: { not: "investment" } },
      select: {
        id: true, name: true, institution: true, currency: true, type: true,
        investmentSubtype: true, investmentSymbol: true,
        _count: { select: { investmentPurchases: true, investmentDividends: true, investmentSnapshots: true, investmentHoldings: true } },
      },
      orderBy: [{ name: "asc" }, { currency: "asc" }],
    }).then((accounts) => accounts
      .filter((account) => !isInvestmentAccountOption({
        ...account,
        hasInvestmentActivity: Object.values(account._count).some((count) => count > 0),
      }))
      .map(({ _count: _investmentCounts, investmentSubtype: _investmentSubtype, investmentSymbol: _investmentSymbol, ...account }) => account)),
  ]);
  return { categories, accounts };
};

export const loadBudgetWorkspaceData = async (workspaceId: string, now = new Date(), options: { directory?: boolean } = {}) => {
  let lookbackStart = getBudgetLookbackStart(now);

  const budgetsPromise = prisma.budget
    .findMany({
      where: {
        workspaceId,
      },
      include: {
        account: {
          select: {
            name: true,
            currency: true,
          },
        },
        category: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [
        {
          updatedAt: "desc",
        },
        {
          createdAt: "desc",
        },
      ],
    })
    .catch((error: unknown) => {
      if (isMissingBudgetTableError(error)) {
        return [];
      }

      throw error;
    });

  // Keep each batch within Clover's Vercel database pool limit. Running all
  // five reads at once can make later queries exceed the acquisition timeout.
  const directoryBudgets = options.directory ? await budgetsPromise : null;
  if (directoryBudgets) lookbackStart = getBudgetDirectoryStart(directoryBudgets, now);
  const readCommitments = () => prisma.financialCommitment.findMany({
    where: { workspaceId, status: "active", kind: { in: ["planned_payment", "debt"] } },
    select: { amount: true, currency: true, accountId: true, dueDate: true, nextDueDate: true, kind: true, status: true },
  });
  const [budgets, transactions, directoryCommitments] = await Promise.all([
    directoryBudgets ?? budgetsPromise,
    directoryBudgets?.length === 0 ? [] : prisma.transaction.findMany({
      where: buildActiveWorkspaceTransactionWhere(workspaceId, {
        date: {
          gte: lookbackStart,
        },
      }),
      select: {
        accountId: true,
        categoryId: true,
        type: true,
        isTransfer: true,
        category: { select: { name: true } },
        amount: true,
        date: true,
        isExcluded: true,
      },
    }),
    options.directory ? (directoryBudgets?.length === 0 ? [] : readCommitments()) : null,
  ]);
  const editorOptions: Awaited<ReturnType<typeof loadBudgetEditorOptions>> = options.directory
    ? { categories: [], accounts: [] }
    : await loadBudgetEditorOptions(workspaceId);
  let categories = editorOptions.categories;
  const accounts = editorOptions.accounts;
  const commitments = directoryCommitments ?? await readCommitments();

  // Parsed rows can be visible in Transactions before the normalization worker finishes.
  // Use them as a read-only fallback so budgets do not look empty during that window.
  let budgetTransactions = transactions;
  // Narrowing the window must not resurrect parsed rows when older normalized
  // transactions would have suppressed the legacy fallback.
  const hasOlderNormalized = options.directory && budgets.length > 0 && transactions.length === 0
    ? await prisma.transaction.findFirst({ where: buildActiveWorkspaceTransactionWhere(workspaceId, { date: { gte: getBudgetLookbackStart(now) } }), select: { id: true } })
    : null;
  if (transactions.length === 0 && !hasOlderNormalized && (!options.directory || budgets.length > 0)) {
    const parsedRows = await prisma.parsedTransaction.findMany({
      where: {
        workspaceId,
        date: { gte: lookbackStart },
        amount: { not: null },
        importFile: {
          OR: [{ status: "done" }, { confirmedAt: { not: null } }, { parsedRowsCount: { gt: 0 } }],
        },
      },
      select: {
        date: true,
        amount: true,
        type: true,
        categoryName: true,
        importFile: {
          select: {
            accountId: true,
          },
        },
      },
    });
    if (options.directory && parsedRows.length > 0) {
      categories = await prisma.category.findMany({ where: { workspaceId, type: "expense" }, select: { id: true, name: true, isArchived: true }, orderBy: [{ isArchived: "asc" }, { name: "asc" }] });
    }
    const categoryIdByName = new Map(categories.map((category) => [category.name.trim().toLowerCase(), category.id]));
    budgetTransactions = parsedRows.flatMap((row) => {
      if (!row.date || row.amount === null) {
        return [];
      }

      const categoryName = row.categoryName?.trim() ?? "";
      return [
        {
          accountId: row.importFile.accountId ?? "__imported_account__",
          categoryId: categoryIdByName.get(categoryName.toLowerCase()) ?? null,
          type: row.type ?? (categoryName.toLowerCase() === "income" ? "income" : "expense"),
          isTransfer: categoryName.toLowerCase() === "transfers",
          category: categoryName ? { name: categoryName } : null,
          amount: row.amount,
          date: row.date,
          isExcluded: false,
        },
      ];
    });
  }

  const overview = buildBudgetOverview({
    budgets,
    transactions: budgetTransactions,
    commitments,
    now,
  });
  const suggestions = options.directory ? [] : buildBudgetSuggestions({
    transactions: budgetTransactions,
    accounts,
    categories,
  });

  const plans = options.directory ? [] : await prisma.budgetPlan.findMany({
    where: { workspaceId },
    select: { id: true, name: true },
    orderBy: [{ createdAt: "asc" }],
  });

  return {
    plans,
    budgets,
    transactions: budgetTransactions,
    categories,
    accounts,
    suggestions,
    overview,
  };
};
