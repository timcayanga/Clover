import { prisma } from "@/lib/prisma";
import { buildBudgetOverview, buildBudgetSuggestions } from "@/lib/budgeting";

export const budgetLookbackDays = 45;

export const getBudgetLookbackStart = (now = new Date()) => new Date(now.getTime() - budgetLookbackDays * 24 * 60 * 60 * 1000);

export const isMissingBudgetTableError = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2021";

export const loadBudgetWorkspaceData = async (workspaceId: string, now = new Date()) => {
  const lookbackStart = getBudgetLookbackStart(now);

  const budgets = await prisma.budget
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

  const [transactions, accounts, categories] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        date: {
          gte: lookbackStart,
        },
      },
      select: {
        accountId: true,
        categoryId: true,
        type: true,
        amount: true,
        date: true,
        isExcluded: true,
      },
    }),
    prisma.account.findMany({
      where: {
        workspaceId,
      },
      select: {
        id: true,
        name: true,
        type: true,
        currency: true,
        balance: true,
      },
      orderBy: {
        createdAt: "asc",
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
  ]);

  const overview = buildBudgetOverview({
    budgets,
    transactions,
    now,
  });
  const suggestions = buildBudgetSuggestions({
    transactions,
    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      currency: account.currency,
    })),
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
    })),
    currency: budgets[0]?.currency ?? accounts.find((account) => account.currency)?.currency ?? "PHP",
  });

  return {
    budgets,
    transactions,
    accounts,
    categories,
    overview,
    suggestions,
  };
};
