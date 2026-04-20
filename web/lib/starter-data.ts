import { prisma } from "@/lib/prisma";
import { DEFAULT_CATEGORY_ROWS } from "@/lib/default-categories";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { isStagingHost } from "@/lib/auth";

const stagingSampleTransactions = [
  {
    merchantRaw: "ACME Payroll",
    merchantClean: "Salary",
    description: "Monthly salary deposit",
    categoryName: "Income",
    type: "income",
    amount: "45000.00",
    daysAgo: 2,
  },
  {
    merchantRaw: "Luna Coffee Bar",
    merchantClean: "Coffee",
    description: "Morning coffee and pastry",
    categoryName: "Food & Dining",
    type: "expense",
    amount: "185.00",
    daysAgo: 1,
  },
  {
    merchantRaw: "MRT / Jeepney Fare",
    merchantClean: "Transit",
    description: "Commuting expense",
    categoryName: "Transport",
    type: "expense",
    amount: "120.00",
    daysAgo: 3,
  },
  {
    merchantRaw: "Manila Home Rentals",
    merchantClean: "Rent",
    description: "Monthly apartment rent",
    categoryName: "Housing",
    type: "expense",
    amount: "12000.00",
    daysAgo: 6,
  },
  {
    merchantRaw: "FiberNet Internet",
    merchantClean: "Internet bill",
    description: "Broadband subscription",
    categoryName: "Bills & Utilities",
    type: "expense",
    amount: "1799.00",
    daysAgo: 8,
  },
  {
    merchantRaw: "CineMax Downtown",
    merchantClean: "Movie night",
    description: "Cinema tickets and snacks",
    categoryName: "Entertainment",
    type: "expense",
    amount: "980.00",
    daysAgo: 9,
  },
  {
    merchantRaw: "Green Basket Market",
    merchantClean: "Groceries",
    description: "Weekend grocery run",
    categoryName: "Other",
    type: "expense",
    amount: "2640.00",
    daysAgo: 10,
  },
  {
    merchantRaw: "Blue Ridge Pharmacy",
    merchantClean: "Pharmacy",
    description: "Medicine and supplies",
    categoryName: "Health & Wellness",
    type: "expense",
    amount: "640.00",
    daysAgo: 12,
  },
  {
    merchantRaw: "Atlas Savings Transfer",
    merchantClean: "Transfer to savings",
    description: "Moved funds to savings",
    categoryName: "Transfers",
    type: "transfer",
    amount: "5000.00",
    daysAgo: 13,
  },
] as const;

const sampleTransactionDate = (daysAgo: number) => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date;
};

const seedStagingSampleTransactions = async (workspaceId: string) => {
  const existingCount = await prisma.transaction.count({ where: { workspaceId } });
  if (existingCount > 0) {
    return;
  }

  const [accounts, categories] = await Promise.all([
    prisma.account.findMany({ where: { workspaceId } }),
    prisma.category.findMany({ where: { workspaceId } }),
  ]);

  const primaryAccount = accounts.find((account) => account.name === "Imported transactions") ?? accounts[0];
  const fallbackAccount = accounts.find((account) => account.type === "cash") ?? primaryAccount;
  const categoryByName = new Map(categories.map((category) => [category.name.trim().toLowerCase(), category]));

  if (!primaryAccount || !fallbackAccount) {
    return;
  }

  const rows = stagingSampleTransactions.map((transaction) => {
    const category = categoryByName.get(transaction.categoryName.toLowerCase()) ?? categoryByName.get("other") ?? null;
    const accountId = transaction.categoryName === "Transfers" ? fallbackAccount.id : primaryAccount.id;

    return {
      workspaceId,
      accountId,
      categoryId: category?.id ?? null,
      date: sampleTransactionDate(transaction.daysAgo),
      amount: transaction.amount,
      currency: "PHP",
      type: transaction.type,
      merchantRaw: transaction.merchantRaw,
      merchantClean: transaction.merchantClean,
      description: transaction.description,
      isTransfer: transaction.type === "transfer",
      isExcluded: false,
    };
  });

  await prisma.transaction.createMany({ data: rows });
};

const normalizeStarterCashAccount = async (workspaceId: string) => {
  await prisma.account.updateMany({
    where: {
      workspaceId,
      name: "Cash on hand",
      type: "cash",
    },
    data: {
      name: "Cash",
      institution: "Cash",
    },
  });
};

export const ensureStarterWorkspace = async (userId: string, email: string, verified: boolean) => {
  const user = await getOrCreateCurrentUser(userId);
  const stagingHost = await isStagingHost();
  const useFreshStartWorkspace = user.dataWipedAt !== null;

  const existing = await prisma.workspace.findFirst({
    where: { userId: user.id },
    include: {
      accounts: true,
      categories: true,
    },
  });

  if (existing) {
    await normalizeStarterCashAccount(existing.id);

    if (stagingHost && !useFreshStartWorkspace) {
      await seedStagingSampleTransactions(existing.id);
    }

    return existing;
  }

  const workspace = await prisma.workspace.create({
    data: {
      userId: user.id,
      name: "Personal",
      type: "personal",
      accounts: {
        create: useFreshStartWorkspace
          ? [
              {
                name: "Cash",
                institution: "Cash",
                type: "cash",
                currency: "PHP",
                source: "manual",
                balance: 0,
              },
            ]
          : [
              {
                name: "Imported transactions",
                institution: "Source upload",
                type: "bank",
                currency: "PHP",
                source: "upload",
              },
              {
                name: "Cash",
                institution: "Cash",
                type: "cash",
                currency: "PHP",
                source: "manual",
                balance: 0,
              },
            ],
      },
      categories: {
        create: DEFAULT_CATEGORY_ROWS.map((category) => ({
          name: category.name,
          type: category.type,
        })),
      },
    },
    include: {
      accounts: true,
      categories: true,
    },
  });

  if (stagingHost) {
    await seedStagingSampleTransactions(workspace.id);
  }

  return workspace;
};

export const seedWorkspaceDefaults = async (workspaceId: string) => {
  const existingCategories = await prisma.category.findMany({ where: { workspaceId } });
  const categoryByName = new Map(existingCategories.map((category) => [category.name.trim().toLowerCase(), category]));
  for (const category of DEFAULT_CATEGORY_ROWS) {
    if (!categoryByName.has(category.name.trim().toLowerCase())) {
      await prisma.category.create({
        data: {
          workspaceId,
          name: category.name,
          type: category.type,
        },
      });
    }
  }

  const existingAccounts = await prisma.account.findMany({ where: { workspaceId } });
  if (existingAccounts.length === 0) {
    await prisma.account.createMany({
      data: [
        {
          workspaceId,
          name: "Cash",
          institution: "Cash",
          type: "cash",
          currency: "PHP",
          source: "manual",
          balance: 0,
        },
      ],
    });
  }

  await normalizeStarterCashAccount(workspaceId);

  if ((await isStagingHost()) && existingAccounts.some((account) => account.name === "Imported transactions" || account.source === "upload")) {
    await seedStagingSampleTransactions(workspaceId);
  }
};
