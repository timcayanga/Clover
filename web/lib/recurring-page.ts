import { prisma } from "@/lib/prisma";
import { buildActiveWorkspaceTransactionWhere } from "@/lib/transaction-query";
import { ensureStarterWorkspace } from "@/lib/starter-data";
import { getUpcomingStatementReminders } from "@/lib/statement-reminders";
import { buildRecurringTransactionSummaries, type RecurringTransactionLike } from "@/lib/recurring";
import { serializeFinancialCommitment, type FinancialCommitmentSummary } from "@/lib/commitments";
import { hasCompatibleTable } from "@/lib/data-engine";
import { syncWorkspaceRecurringPatterns } from "@/lib/recurring-detection";
import { getPlannedPaymentSuggestions, getRecurringConfidenceTier, type PlannedPaymentSuggestion } from "@/lib/planned-payment-suggestions";
import { syncReceivableAccountCommitments } from "@/lib/imported-receivables.server";
import { resolveTrackedCommitmentDueDate, toCommitmentOccurrenceKey } from "@/lib/commitment-occurrences";
import { DEFAULT_CATEGORY_ROWS } from "@/lib/default-categories";
import { after } from "next/server";

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
  categoryOptions: string[];
  liabilityAccountCount: number;
};

type CommitmentForEnrichment = FinancialCommitmentSummary;

const normalizeRecurringMatchText = (value: string | null | undefined) =>
  (value ?? "")
    .toLowerCase()
    .replace(/\b(payment|payments|subscription|monthly|annual|bill|bills|recurring)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const inferCommitmentCategory = (commitment: CommitmentForEnrichment) => {
  const text = `${commitment.title} ${commitment.counterparty ?? ""}`.toLowerCase();
  if (/subscription|membership|netflix|spotify|openai|chatgpt|icloud|youtube|adobe/.test(text)) return "Subscriptions";
  if (/electric|water|utility|utilities|internet|broadband|phone|mobile|globe|smart|pldt|meralco|maynilad/.test(text)) return "Bills & Utilities";
  if (/rent|lease|mortgage/.test(text)) return "Housing";
  if (/tuition|school|education/.test(text)) return "Education";
  if (/insurance|loan|credit|debt|installment|amortization/.test(text)) return "Financial";
  if (commitment.kind === "receivable") return "Income";
  if (commitment.kind === "debt" || commitment.kind === "reminder") return "Financial";
  return "Other";
};

export const enrichRecurringCommitments = (params: {
  commitments: CommitmentForEnrichment[];
  transactions: RecurringPageTransaction[];
  accounts: RecurringPageAccount[];
  now?: Date;
}) => {
  const accountById = new Map(params.accounts.map((account) => [account.id, account]));

  return params.commitments.map((commitment) => {
    const titleKey = normalizeRecurringMatchText(`${commitment.title} ${commitment.counterparty ?? ""}`);
    const titleTokens = new Set(titleKey.split(" ").filter((token) => token.length >= 3));
    const amount = Number(commitment.amount);
    const candidates = params.transactions
      .map((transaction) => {
        const transactionKey = normalizeRecurringMatchText(
          `${transaction.merchantClean ?? ""} ${transaction.merchantRaw} ${transaction.description ?? ""}`
        );
        const transactionTokens = new Set(transactionKey.split(" ").filter((token) => token.length >= 3));
        const sharedTokens = [...titleTokens].filter((token) => transactionTokens.has(token)).length;
        const exactText = Boolean(titleKey) && (transactionKey.includes(titleKey) || titleKey.includes(transactionKey));
        const transactionAmount = Math.abs(Number(transaction.amount));
        const amountMatches = Number.isFinite(amount) && amount > 0 && Math.abs(transactionAmount - Math.abs(amount)) <= Math.max(1, amount * 0.02);
        const currencyMatches = transaction.currency.toUpperCase() === commitment.currency.toUpperCase();
        const score = (exactText ? 6 : 0) + sharedTokens * 2 + (amountMatches ? 3 : 0) + (currencyMatches ? 1 : -4);
        return { transaction, score };
      })
      .filter((candidate) => candidate.score >= 5)
      .sort((left, right) => right.score - left.score || new Date(right.transaction.date).getTime() - new Date(left.transaction.date).getTime());

    const bestMatch = candidates[0] ?? null;
    const runnerUp = candidates[1] ?? null;
    const hasReliableMatch = Boolean(bestMatch && (!runnerUp || bestMatch.score >= runnerUp.score + 2 || bestMatch.transaction.account.id === runnerUp.transaction.account.id));
    const matchedTransaction = hasReliableMatch ? bestMatch?.transaction ?? null : null;
    const explicitTransaction = commitment.transactionId
      ? params.transactions.find((transaction) => transaction.id === commitment.transactionId) ?? null
      : null;
    const evidenceTransaction = explicitTransaction ?? matchedTransaction;
    const inferredAccountId = commitment.accountId ? null : evidenceTransaction?.account.id ?? null;
    const inferredAccountRecord = inferredAccountId ? accountById.get(inferredAccountId) ?? null : null;
    const occurrenceDate = resolveTrackedCommitmentDueDate({
      dueDate: commitment.dueDate ? new Date(commitment.dueDate) : null,
      nextDueDate: commitment.nextDueDate ? new Date(commitment.nextDueDate) : null,
      recurrence: commitment.recurrence,
      now: params.now,
    });

    return {
      ...commitment,
      categoryName: commitment.categoryName ?? evidenceTransaction?.category?.name ?? inferCommitmentCategory(commitment),
      categorySource: commitment.categoryName
        ? "manual" as const
        : evidenceTransaction?.category?.name
          ? "transaction" as const
          : "inferred" as const,
      inferredAccountId,
      inferredAccount: inferredAccountRecord
        ? {
            id: inferredAccountRecord.id,
            name: inferredAccountRecord.name,
            institution: inferredAccountRecord.institution,
            type: inferredAccountRecord.type,
          }
        : null,
      occurrenceDueDate: occurrenceDate ? toCommitmentOccurrenceKey(occurrenceDate) : null,
    };
  });
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

  // Import processing already performs recurring detection. Keep the page render
  // read-only and refresh legacy enrichment after the response has streamed so a
  // maintenance timeout can never hold the calendar behind a loading screen.
  after(async () => {
    await Promise.all([
      hasRecurringPatternTable
        ? withRecurringEnrichmentTimeout(syncWorkspaceRecurringPatterns(workspaceId), [], "patterns")
        : Promise.resolve([]),
      withRecurringEnrichmentTimeout(syncReceivableAccountCommitments(workspaceId), 0, "receivable accounts"),
    ]);
  });

  const [reminders, accounts, transactions, commitments, recurringPatterns, plannedPaymentSuggestions, categoryRows] = await Promise.all([
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
      where: buildActiveWorkspaceTransactionWhere(workspaceId, {
        date: {
          gte: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
        },
      }),
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
            category: {
              select: { name: true },
            },
            account: {
              select: {
                name: true,
              },
            },
          },
        },
        occurrences: {
          orderBy: { dueDate: "desc" },
          take: 24,
          select: { dueDate: true, completedAt: true },
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
    prisma.category.findMany({
      where: { workspaceId, isArchived: false },
      select: { name: true },
      orderBy: { name: "asc" },
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
  const categoryOptions = Array.from(new Set([
    ...categoryRows.map((category) => category.name),
    ...DEFAULT_CATEGORY_ROWS.map((category) => category.name),
  ])).sort((left, right) => left.localeCompare(right));

  const enrichedCommitments = enrichRecurringCommitments({
    commitments: commitments.map((commitment) => serializeFinancialCommitment(commitment)),
    transactions: serializedTransactions,
    accounts: serializedAccounts,
  }).map((commitment) => {
    const sourceCommitment = commitments.find((item) => item.id === commitment.id);
    const completedOccurrence = commitment.occurrenceDueDate
      ? sourceCommitment?.occurrences.find(
          (occurrence) => toCommitmentOccurrenceKey(occurrence.dueDate) === commitment.occurrenceDueDate
        )
      : null;
    return {
      ...commitment,
      occurrenceCompletedAt: completedOccurrence?.completedAt.toISOString() ?? null,
    };
  });

  return {
    reminders,
    accounts: serializedAccounts,
    transactions: serializedTransactions,
    recurringItems,
    commitments: enrichedCommitments,
    recurringPatterns: serializedRecurringPatterns,
    categoryOptions,
    plannedPaymentSuggestions,
    liabilityAccountCount,
  };
}
