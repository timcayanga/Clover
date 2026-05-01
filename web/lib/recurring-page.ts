import { prisma } from "@/lib/prisma";
import { ensureStarterWorkspace } from "@/lib/starter-data";
import { getUpcomingStatementReminders } from "@/lib/statement-reminders";
import { buildRecurringTransactionSummaries, type RecurringTransactionLike } from "@/lib/recurring";
import { serializeFinancialCommitment, type FinancialCommitmentSummary } from "@/lib/commitments";

export type RecurringPageAccount = {
  id: string;
  name: string;
  institution: string | null;
  type: string;
  balance: string | null;
};

export type RecurringPageTransaction = {
  id: string;
  date: string;
  amount: string;
  currency: string;
  type: "income" | "expense" | "transfer";
  merchantRaw: string;
  merchantClean: string | null;
  category: {
    name: string;
  } | null;
  account: {
    name: string;
    currency: string | null;
  };
};

export type RecurringPageData = {
  reminders: Awaited<ReturnType<typeof getUpcomingStatementReminders>>;
  accounts: RecurringPageAccount[];
  transactions: RecurringPageTransaction[];
  recurringItems: ReturnType<typeof buildRecurringTransactionSummaries>;
  commitments: FinancialCommitmentSummary[];
  liabilityAccountCount: number;
};

export async function getRecurringWorkspaceId(userId: string, clerkUserId: string, email: string, verified: boolean) {
  const selectedWorkspace = await prisma.workspace.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (selectedWorkspace) {
    return selectedWorkspace.id;
  }

  const starterWorkspace = await ensureStarterWorkspace(clerkUserId, email, verified);
  const workspace = await prisma.workspace.findUnique({
    where: { id: starterWorkspace.id },
    select: { id: true },
  });

  return workspace?.id ?? starterWorkspace.id;
}

export async function getRecurringPageData(workspaceId: string): Promise<RecurringPageData> {
  const [reminders, accounts, transactions, commitments] = await Promise.all([
    getUpcomingStatementReminders(workspaceId),
    prisma.account.findMany({
      where: { workspaceId },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        institution: true,
        type: true,
        balance: true,
      },
    }),
    prisma.transaction.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        date: {
          gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
        },
      },
      orderBy: { date: "desc" },
      take: 250,
      select: {
        id: true,
        date: true,
        amount: true,
        currency: true,
        type: true,
        merchantRaw: true,
        merchantClean: true,
        category: {
          select: {
            name: true,
          },
        },
        account: {
          select: {
            name: true,
            currency: true,
          },
        },
      },
    }),
    prisma.financialCommitment.findMany({
      where: { workspaceId },
      orderBy: [
        { nextDueDate: "asc" },
        { dueDate: "asc" },
        { createdAt: "desc" },
      ],
      include: {
        account: {
          select: {
            id: true,
            name: true,
            institution: true,
            type: true,
          },
        },
        transaction: {
          select: {
            id: true,
            date: true,
            amount: true,
            merchantRaw: true,
            merchantClean: true,
            account: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const recurringItems = buildRecurringTransactionSummaries(transactions as RecurringTransactionLike[]);
  const liabilityAccountCount = accounts.filter((account) => account.type === "credit_card").length;
  const serializedAccounts = accounts.map((account) => ({
    id: account.id,
    name: account.name,
    institution: account.institution,
    type: account.type,
    balance: account.balance?.toString() ?? null,
  }));
  const serializedTransactions = transactions.map((transaction) => ({
    id: transaction.id,
    date: transaction.date.toISOString(),
    amount: transaction.amount.toString(),
    currency: transaction.currency ?? "PHP",
    type: transaction.type,
    merchantRaw: transaction.merchantRaw,
    merchantClean: transaction.merchantClean,
    category: transaction.category,
    account: {
      name: transaction.account.name,
      currency: transaction.account.currency ?? null,
    },
  }));

  return {
    reminders,
    accounts: serializedAccounts,
    transactions: serializedTransactions,
    recurringItems,
    commitments: commitments.map((commitment) => serializeFinancialCommitment(commitment)),
    liabilityAccountCount,
  };
}
