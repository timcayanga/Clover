import { prisma } from "@/lib/prisma";
import { buildBudgetOverview } from "@/lib/budgeting";

export const budgetLookbackDays = 35;

export const getBudgetLookbackStart = (now = new Date()) => new Date(now.getTime() - budgetLookbackDays * 24 * 60 * 60 * 1000);

export const isMissingBudgetTableError = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2021";

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

  const [budgets, transactions, categories] = await Promise.all([
    budgetsPromise,
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

  return {
    budgets,
    transactions,
    categories,
    overview,
  };
};
