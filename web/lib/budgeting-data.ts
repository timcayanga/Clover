import { prisma } from "@/lib/prisma";
import { buildBudgetOverview, buildBudgetSuggestions } from "@/lib/budgeting";
import { buildActiveWorkspaceTransactionWhere } from "@/lib/transaction-query";

export const budgetLookbackDays = 400;

export const getBudgetLookbackStart = (now = new Date()) => new Date(now.getTime() - budgetLookbackDays * 24 * 60 * 60 * 1000);

export const isMissingBudgetTableError = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  (((error as { code?: string }).code === "P2021") ||
    (error instanceof Error && /(?:public\.)?Budget.*does not exist|table .*Budget.*does not exist/i.test(error.message)));

export const loadBudgetWorkspaceData = async (workspaceId: string, now = new Date()) => {
  const lookbackStart = getBudgetLookbackStart(now);

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

  const [budgets, transactions, categories, accounts, commitments] = await Promise.all([
    budgetsPromise,
    prisma.transaction.findMany({
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
    prisma.category.findMany({
      where: {
        workspaceId,
        type: "expense",
      },
      select: {
        id: true,
        name: true,
        isArchived: true,
      },
      orderBy: [
        {
          isArchived: "asc",
        },
        {
          name: "asc",
        },
      ],
    }),
    prisma.account.findMany({
      where: {
        workspaceId,
        type: { not: "investment" },
      },
      select: {
        id: true,
        name: true,
        currency: true,
        type: true,
      },
      orderBy: [{ name: "asc" }],
    }),
    prisma.financialCommitment.findMany({
      where: {
        workspaceId,
        status: "active",
        kind: { in: ["planned_payment", "debt"] },
      },
      select: {
        amount: true,
        currency: true,
        accountId: true,
        dueDate: true,
        nextDueDate: true,
        kind: true,
        status: true,
      },
    }),
  ]);

  // Parsed rows can be visible in Transactions before the normalization worker finishes.
  // Use them as a read-only fallback so budgets do not look empty during that window.
  let budgetTransactions = transactions;
  if (transactions.length === 0) {
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
  const suggestions = buildBudgetSuggestions({
    transactions: budgetTransactions,
    accounts,
    categories,
  });

  return {
    budgets,
    transactions: budgetTransactions,
    categories,
    accounts,
    suggestions,
    overview,
  };
};
