import { Prisma, type CommitmentRecurrence } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasCompatibleTable } from "@/lib/data-engine";

type RecurringSourceTransaction = {
  id: string;
  workspaceId: string;
  accountId: string | null;
  date: Date;
  amount: { toString: () => string } | string | number;
  currency: string | null;
  type: "income" | "expense" | "transfer";
  merchantRaw: string;
  merchantClean: string | null;
  category?: {
    name: string;
  } | null;
};

type DetectedRecurringPattern = {
  workspaceId: string;
  accountId: string | null;
  merchantRaw: string;
  merchantClean: string | null;
  amount: number;
  currency: string;
  frequency: CommitmentRecurrence;
  firstSeenDate: Date;
  lastSeenDate: Date;
  nextExpectedDate: Date;
  transactionCount: number;
  confidence: number;
  rawPayload: Prisma.InputJsonValue;
};

const recurringKeywordPattern =
  /\b(rent|internet|bill|utility|utilities|subscription|electric|water|phone|insurance|mortgage|loan|fee|netflix|spotify|youtube|icloud|google|openai|chatgpt|adobe|microsoft|canva|grab|globe|smart|pldt|meralco)\b/i;

const normalizeMerchantKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(pos|visa|mastercard|debit|credit|online|payment|pay|ph|inc|corp|co|ref|auth|card)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const isDismissedRecurringPattern = (value: Prisma.JsonValue | null | undefined) =>
  Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as Record<string, unknown>).dismissed === true
  );

const toAmount = (value: RecurringSourceTransaction["amount"]) => {
  const parsed = Number(value?.toString?.() ?? value ?? 0);
  return Number.isFinite(parsed) ? Math.abs(parsed) : 0;
};

const median = (values: number[]) => {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) {
    return 0;
  }

  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2 : (sorted[middle] ?? 0);
};

const daysBetween = (left: Date, right: Date) => Math.round(Math.abs(right.getTime() - left.getTime()) / 86_400_000);

const monthDiff = (left: Date, right: Date) =>
  (right.getFullYear() - left.getFullYear()) * 12 + right.getMonth() - left.getMonth();

const addMonths = (date: Date, months: number) => {
  const next = new Date(date);
  const day = next.getDate();
  next.setMonth(next.getMonth() + months, 1);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const inferFrequency = (dates: Date[]): { frequency: CommitmentRecurrence | null; nextExpectedDate: Date | null; cadenceConfidence: number } => {
  const sortedDates = [...dates].sort((left, right) => left.getTime() - right.getTime());
  if (sortedDates.length < 2) {
    return { frequency: null, nextExpectedDate: null, cadenceConfidence: 0 };
  }

  const intervals = sortedDates.slice(1).map((date, index) => daysBetween(sortedDates[index] as Date, date));
  const typicalInterval = median(intervals);
  const lastSeenDate = sortedDates[sortedDates.length - 1] as Date;
  const sameDayOfMonthCount = sortedDates.filter((date) => Math.abs(date.getDate() - lastSeenDate.getDate()) <= 5).length;
  const monthGaps = sortedDates.slice(1).map((date, index) => monthDiff(sortedDates[index] as Date, date));
  const positiveMonthGaps = monthGaps.filter((gap) => gap > 0);
  const looksMonthlyAcrossGaps =
    positiveMonthGaps.length > 0 &&
    sameDayOfMonthCount >= Math.min(2, sortedDates.length) &&
    positiveMonthGaps.every((gap) => gap >= 1 && gap <= 4);

  if (typicalInterval >= 6 && typicalInterval <= 8) {
    return { frequency: "weekly", nextExpectedDate: addDays(lastSeenDate, 7), cadenceConfidence: 84 };
  }

  if (typicalInterval >= 12 && typicalInterval <= 16) {
    return { frequency: "biweekly", nextExpectedDate: addDays(lastSeenDate, 14), cadenceConfidence: 82 };
  }

  if ((typicalInterval >= 25 && typicalInterval <= 35) || looksMonthlyAcrossGaps) {
    return { frequency: "monthly", nextExpectedDate: addMonths(lastSeenDate, 1), cadenceConfidence: looksMonthlyAcrossGaps ? 78 : 86 };
  }

  if (typicalInterval >= 80 && typicalInterval <= 100) {
    return { frequency: "quarterly", nextExpectedDate: addMonths(lastSeenDate, 3), cadenceConfidence: 78 };
  }

  if (typicalInterval >= 330 && typicalInterval <= 400) {
    return { frequency: "annual", nextExpectedDate: addMonths(lastSeenDate, 12), cadenceConfidence: 72 };
  }

  return { frequency: null, nextExpectedDate: null, cadenceConfidence: 0 };
};

const buildPatternFromTransactions = (transactions: RecurringSourceTransaction[]): DetectedRecurringPattern | null => {
  const expenseTransactions = transactions
    .filter((transaction) => transaction.type === "expense")
    .sort((left, right) => left.date.getTime() - right.date.getTime());
  if (expenseTransactions.length < 2) {
    return null;
  }

  const amounts = expenseTransactions.map((transaction) => toAmount(transaction.amount)).filter((amount) => amount > 0);
  const typicalAmount = median(amounts);
  if (typicalAmount <= 0) {
    return null;
  }

  const amountTolerance = Math.max(20, typicalAmount * 0.12);
  const stableAmountCount = amounts.filter((amount) => Math.abs(amount - typicalAmount) <= amountTolerance).length;
  const amountStability = stableAmountCount / Math.max(amounts.length, 1);
  const categoryNames = new Set(expenseTransactions.map((transaction) => transaction.category?.name?.toLowerCase() ?? ""));
  const textBlob = expenseTransactions
    .map((transaction) => `${transaction.merchantClean ?? ""} ${transaction.merchantRaw} ${transaction.category?.name ?? ""}`)
    .join(" ");
  const hasKeywordSignal = recurringKeywordPattern.test(textBlob) || categoryNames.has("bills & utilities");
  const cadence = inferFrequency(expenseTransactions.map((transaction) => transaction.date));

  if (!cadence.frequency || !cadence.nextExpectedDate) {
    return null;
  }

  if (!hasKeywordSignal && amountStability < 0.65 && expenseTransactions.length < 3) {
    return null;
  }

  const first = expenseTransactions[0] as RecurringSourceTransaction;
  const last = expenseTransactions[expenseTransactions.length - 1] as RecurringSourceTransaction;
  const confidence = Math.min(
    94,
    Math.round(
      35 +
        Math.min(expenseTransactions.length, 6) * 7 +
        cadence.cadenceConfidence * 0.25 +
        amountStability * 20 +
        (hasKeywordSignal ? 10 : 0)
    )
  );

  if (confidence < 62) {
    return null;
  }

  return {
    workspaceId: first.workspaceId,
    accountId: first.accountId,
    merchantRaw: first.merchantRaw,
    merchantClean: first.merchantClean ?? first.merchantRaw,
    amount: Number(typicalAmount.toFixed(2)),
    currency: (first.currency ?? "PHP").trim().toUpperCase() || "PHP",
    frequency: cadence.frequency,
    firstSeenDate: first.date,
    lastSeenDate: last.date,
    nextExpectedDate: cadence.nextExpectedDate,
    transactionCount: expenseTransactions.length,
    confidence,
    rawPayload: {
      source: "recurring_detection",
      transactionIds: expenseTransactions.map((transaction) => transaction.id),
      amountStability,
      hasKeywordSignal,
    },
  };
};

export const detectRecurringPatterns = (transactions: RecurringSourceTransaction[]) => {
  const groups = new Map<string, RecurringSourceTransaction[]>();

  for (const transaction of transactions) {
    if (transaction.type !== "expense") {
      continue;
    }

    const merchantKey = normalizeMerchantKey(transaction.merchantClean ?? transaction.merchantRaw);
    if (!merchantKey) {
      continue;
    }

    const currency = (transaction.currency ?? "PHP").trim().toUpperCase() || "PHP";
    const key = `${transaction.workspaceId}::${transaction.accountId ?? "workspace"}::${currency}::${merchantKey}`;
    groups.set(key, [...(groups.get(key) ?? []), transaction]);
  }

  return Array.from(groups.values())
    .map(buildPatternFromTransactions)
    .filter((pattern): pattern is DetectedRecurringPattern => Boolean(pattern))
    .sort((left, right) => right.confidence - left.confidence || right.transactionCount - left.transactionCount);
};

export const syncWorkspaceRecurringPatterns = async (workspaceId: string) => {
  if (!(await hasCompatibleTable("RecurringPattern"))) {
    return [];
  }

  const transactions = await prisma.transaction.findMany({
    where: {
      workspaceId,
      deletedAt: null,
      isExcluded: false,
      type: "expense",
      date: {
        gte: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
      },
    },
    select: {
      id: true,
      workspaceId: true,
      accountId: true,
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
    },
    orderBy: [{ merchantClean: "asc" }, { merchantRaw: "asc" }, { date: "asc" }],
    take: 1200,
  });

  const detectedPatterns = detectRecurringPatterns(transactions);
  const existingCommitments = await prisma.financialCommitment.findMany({
    where: { workspaceId, status: { not: "resolved" } },
    select: { title: true, counterparty: true, accountId: true, currency: true },
  });
  const existingCommitmentKeys = new Set(
    existingCommitments.map((commitment) =>
      [
        commitment.accountId ?? "workspace",
        (commitment.currency ?? "PHP").toUpperCase(),
        normalizeMerchantKey(commitment.counterparty ?? commitment.title),
      ].join("::")
    )
  );

  const patterns = detectedPatterns.filter((pattern) => {
    const key = [pattern.accountId ?? "workspace", pattern.currency, normalizeMerchantKey(pattern.merchantClean ?? pattern.merchantRaw)].join("::");
    return !existingCommitmentKeys.has(key);
  });

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw<Array<{ locked: string }>>`
      SELECT pg_advisory_xact_lock(hashtextextended(${`recurring-pattern-sync:${workspaceId}`}, 0))::text AS locked
    `;

    for (const pattern of patterns) {
      const existingPattern = await tx.recurringPattern.findFirst({
        where: {
          workspaceId,
          accountId: pattern.accountId,
          currency: pattern.currency,
          OR: [
            { merchantClean: pattern.merchantClean },
            { merchantRaw: pattern.merchantRaw },
          ],
        },
        orderBy: { updatedAt: "desc" },
      });

      if (existingPattern) {
        if (isDismissedRecurringPattern(existingPattern.rawPayload)) {
          continue;
        }

        await tx.recurringPattern.update({
          where: { id: existingPattern.id },
          data: {
            merchantRaw: pattern.merchantRaw,
            merchantClean: pattern.merchantClean,
            amount: pattern.amount,
            frequency: pattern.frequency,
            firstSeenDate: pattern.firstSeenDate,
            lastSeenDate: pattern.lastSeenDate,
            nextExpectedDate: pattern.nextExpectedDate,
            transactionCount: pattern.transactionCount,
            confidence: pattern.confidence,
            rawPayload: pattern.rawPayload,
          },
        });
      } else {
        await tx.recurringPattern.create({
          data: pattern,
        });
      }
    }
  });

  return patterns;
};
