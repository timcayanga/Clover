import { prisma } from "@/lib/prisma";
import { ensureStarterWorkspace } from "@/lib/starter-data";
import { getUpcomingStatementReminders } from "@/lib/statement-reminders";
import { buildRecurringTransactionSummaries, type RecurringTransactionLike } from "@/lib/recurring";
import { serializeFinancialCommitment, type FinancialCommitmentSummary } from "@/lib/commitments";
import { hasCompatibleTable } from "@/lib/data-engine";
import { syncWorkspaceRecurringPatterns } from "@/lib/recurring-detection";
import { getPlannedPaymentSuggestions, getRecurringConfidenceTier, type PlannedPaymentSuggestion } from "@/lib/planned-payment-suggestions";

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
  description: string | null;
  rawPayload: unknown;
  importFileId: string | null;
  category: {
    name: string;
  } | null;
  account: {
    id: string;
    name: string;
    institution: string | null;
    currency: string | null;
  };
};

export type RecurringPatternSummary = {
  id: string;
  merchantRaw: string;
  merchantClean: string | null;
  amount: string | null;
  currency: string;
  frequency: string | null;
  firstSeenDate: string | null;
  lastSeenDate: string | null;
  nextExpectedDate: string | null;
  transactionCount: number;
  distinctMonthCount: number;
  accountCount: number;
  confidenceTier: "high" | "medium" | "low";
  confidence: number;
  reasonSummary: string | null;
  reasonTags: string[];
  account: {
    id: string;
    name: string;
    institution: string | null;
  } | null;
};

export type RecurringPageData = {
  reminders: Awaited<ReturnType<typeof getUpcomingStatementReminders>>;
  plannedPaymentSuggestions: PlannedPaymentSuggestion[];
  accounts: RecurringPageAccount[];
  transactions: RecurringPageTransaction[];
  recurringItems: ReturnType<typeof buildRecurringTransactionSummaries>;
  commitments: FinancialCommitmentSummary[];
  recurringPatterns: RecurringPatternSummary[];
  liabilityAccountCount: number;
};

const RECURRING_ENRICHMENT_TIMEOUT_MS = 2500;

const withRecurringEnrichmentTimeout = async <T>(promise: Promise<T>, fallback: T, label: string) => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise.catch((error: unknown) => {
        console.warn(`Unable to load recurring ${label}`, error);
        return fallback;
      }),
      new Promise<T>((resolve) => {
        timeoutId = setTimeout(() => {
          console.warn(`Timed out loading recurring ${label}`);
          resolve(fallback);
        }, RECURRING_ENRICHMENT_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

export async function getRecurringWorkspaceId(
  clerkUserId: string,
  email: string,
  verified: boolean,
  preferredWorkspaceId?: string
) {
  if (preferredWorkspaceId) {
    const selectedWorkspace = await prisma.workspace.findFirst({
      where: {
        id: preferredWorkspaceId,
        user: {
          clerkUserId,
        },
      },
      select: { id: true },
    });
    if (selectedWorkspace) {
      return selectedWorkspace.id;
    }
  }

  const selectedWorkspace = await prisma.workspace.findFirst({
    where: {
      user: {
        clerkUserId,
      },
    },
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
  const hasRecurringPatternTable = await hasCompatibleTable("RecurringPattern");

  if (hasRecurringPatternTable) {
    await withRecurringEnrichmentTimeout(syncWorkspaceRecurringPatterns(workspaceId), [], "patterns");
  }

  const [reminders, accounts, transactions, commitments, recurringPatterns, plannedPaymentSuggestions] = await Promise.all([
    withRecurringEnrichmentTimeout(getUpcomingStatementReminders(workspaceId), [], "statement reminders"),
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
          gte: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
        },
      },
      orderBy: { date: "desc" },
      take: 1200,
      select: {
        id: true,
        date: true,
        amount: true,
        currency: true,
        type: true,
        merchantRaw: true,
        merchantClean: true,
        description: true,
        rawPayload: true,
        importFileId: true,
        category: {
          select: {
            name: true,
          },
        },
        account: {
          select: {
            id: true,
            name: true,
            institution: true,
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
    hasRecurringPatternTable
      ? prisma.recurringPattern.findMany({
          where: {
            workspaceId,
            NOT: {
              rawPayload: {
                path: ["dismissed"],
                equals: true,
              },
            },
          },
          orderBy: [{ nextExpectedDate: "asc" }, { lastSeenDate: "desc" }, { createdAt: "desc" }],
          take: 50,
          select: {
            id: true,
            merchantRaw: true,
            merchantClean: true,
            amount: true,
            currency: true,
            frequency: true,
            firstSeenDate: true,
            lastSeenDate: true,
            nextExpectedDate: true,
            transactionCount: true,
            confidence: true,
            rawPayload: true,
            account: {
              select: {
                id: true,
                name: true,
                institution: true,
              },
            },
          },
        })
      : Promise.resolve([]),
    withRecurringEnrichmentTimeout(getPlannedPaymentSuggestions(workspaceId), [], "payment suggestions"),
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
    description: transaction.description,
    rawPayload: transaction.rawPayload,
    importFileId: transaction.importFileId,
    category: transaction.category,
    account: {
      id: transaction.account.id,
      name: transaction.account.name,
      institution: transaction.account.institution,
      currency: transaction.account.currency ?? null,
    },
  }));
  const serializedRecurringPatterns = recurringPatterns.map((pattern) => ({
    id: pattern.id,
    merchantRaw: pattern.merchantRaw,
    merchantClean: pattern.merchantClean,
    amount: pattern.amount?.toString() ?? null,
    currency: pattern.currency ?? "PHP",
    frequency: pattern.frequency ?? null,
    firstSeenDate: pattern.firstSeenDate?.toISOString() ?? null,
    lastSeenDate: pattern.lastSeenDate?.toISOString() ?? null,
    nextExpectedDate: pattern.nextExpectedDate?.toISOString() ?? null,
    transactionCount: pattern.transactionCount,
    distinctMonthCount:
      pattern.rawPayload &&
      typeof pattern.rawPayload === "object" &&
      !Array.isArray(pattern.rawPayload) &&
      typeof (pattern.rawPayload as Record<string, unknown>).distinctMonthCount === "number"
        ? (pattern.rawPayload as Record<string, number>).distinctMonthCount
        : 0,
    accountCount:
      pattern.rawPayload &&
      typeof pattern.rawPayload === "object" &&
      !Array.isArray(pattern.rawPayload) &&
      typeof (pattern.rawPayload as Record<string, unknown>).accountCount === "number"
        ? (pattern.rawPayload as Record<string, number>).accountCount
        : pattern.account
          ? 1
          : 0,
    confidenceTier: getRecurringConfidenceTier(pattern.confidence),
    confidence: pattern.confidence,
    reasonSummary:
      pattern.rawPayload && typeof pattern.rawPayload === "object" && !Array.isArray(pattern.rawPayload)
        ? (typeof (pattern.rawPayload as Record<string, unknown>).reasonSummary === "string"
            ? (pattern.rawPayload as Record<string, unknown>).reasonSummary as string
            : null)
        : null,
    reasonTags:
      pattern.rawPayload &&
      typeof pattern.rawPayload === "object" &&
      !Array.isArray(pattern.rawPayload) &&
      Array.isArray((pattern.rawPayload as Record<string, unknown>).reasonTags)
        ? ((pattern.rawPayload as Record<string, unknown>).reasonTags as unknown[])
            .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : [],
    account: pattern.account
      ? {
          id: pattern.account.id,
          name: pattern.account.name,
          institution: pattern.account.institution,
        }
      : null,
  }));

  return {
    reminders,
    accounts: serializedAccounts,
    transactions: serializedTransactions,
    recurringItems,
    commitments: commitments.map((commitment) => serializeFinancialCommitment(commitment)),
    recurringPatterns: serializedRecurringPatterns,
    plannedPaymentSuggestions,
    liabilityAccountCount,
  };
}
