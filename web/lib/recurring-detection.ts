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
  description?: string | null;
  category?: {
    name: string;
  } | null;
  account?: {
    id: string | null;
    name: string | null;
    institution: string | null;
  } | null;
  importFile?: {
    fileName: string;
  } | null;
};

type DetectedRecurringPattern = {
  workspaceId: string;
  accountId: string | null;
  merchantRaw: string;
  merchantClean: string | null;
  canonicalTitle: string;
  amount: number;
  minimumAmount: number;
  maximumAmount: number;
  currency: string;
  frequency: CommitmentRecurrence;
  firstSeenDate: Date;
  lastSeenDate: Date;
  nextExpectedDate: Date;
  expectedDayOfMonth: number | null;
  transactionCount: number;
  confidence: number;
  reasonSummary: string;
  reasonTags: string[];
  suppressionKey: string;
  rawPayload: Prisma.InputJsonValue;
  account: {
    id: string | null;
    name: string | null;
    institution: string | null;
  } | null;
  importFile: {
    fileName: string;
  } | null;
};

const recurringKeywordPattern =
  /\b(rent|internet|bill|utility|utilities|subscription|subscr(?:iption)?|monthly|electric|water|phone|insurance|mortgage|loan|repayment|amortization|dues|fee|netflix|spotify|youtube|icloud|google|openai|chatgpt|adobe|microsoft|canva|scribd|linkedin|globe|smart|pldt|meralco)\b/i;
const recurringExclusionPattern =
  /\b(transfer|instapay|fund transfer|outward|inward|cash payment|bills payment|payment to card|card payment|atm withdrawal|cash advance|top up|cash in|incoming credit|refund|reversal)\b/i;
const recurringNoiseTitlePattern =
  /^(transfer from|transfer to|interbank transfer|instapay ?fee|load purchase|in app purchase for mobile|atm withdrawal|withholding tax|interest applied|mobile load)/i;

const recurringMerchantAliases = [
  { pattern: /\bopenai\b.*\b(chatgpt|subscr(?:iption)?)\b|\bchatgpt\b/i, label: "OpenAI ChatGPT" },
  { pattern: /\bnetflix\b/i, label: "Netflix" },
  { pattern: /\bspotify\b/i, label: "Spotify" },
  { pattern: /\bdisney\b.*\bplus\b|\bdisney\+\b/i, label: "Disney+" },
  { pattern: /\bprime\b.*\b(video|membership)\b|\bamazon\b.*\bprime\b/i, label: "Amazon Prime" },
  { pattern: /\bapple\b.*\bmusic\b/i, label: "Apple Music" },
  { pattern: /\byoutube\b.*\b(premium|music|subscription)?\b/i, label: "YouTube" },
  { pattern: /\bapple\b.*\b(icloud|itunes|bill|services?)\b|\bicloud\b/i, label: "Apple / iCloud" },
  { pattern: /\bgoogle\b.*\b(one|storage|workspace|subscription)?\b/i, label: "Google" },
  { pattern: /\badobe\b/i, label: "Adobe" },
  { pattern: /\bcanva\b/i, label: "Canva" },
  { pattern: /\bscribd\b/i, label: "Scribd" },
  { pattern: /\blinkedin\b/i, label: "LinkedIn" },
  { pattern: /\bmicrosoft\b.*\b(365|subscription|office)\b/i, label: "Microsoft" },
  { pattern: /\bmeralco\b/i, label: "Meralco" },
  { pattern: /\bpldt\b/i, label: "PLDT" },
  { pattern: /\bglobe\b/i, label: "Globe" },
  { pattern: /\bsmart\b/i, label: "Smart" },
  { pattern: /\bgrab\b.*\b(unlimited|subscription|plus)\b/i, label: "Grab" },
  { pattern: /\bamazon web services\b|\baws\b/i, label: "Amazon Web Services" },
];

const recurringFamilyNoisePattern =
  /\b(?:subscription|subscr(?:iption)?|recurring|monthly|autopay|premium|membership|member|plan|service|services|merchant|purchase|ecommerce|online|intl|international|foreign|debit|credit|visa|mastercard|pos|approval|reference|ref|auth|descriptor|statement|biller|billers?)\b/g;

const normalizeMerchantKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bsubscr(?:iption)?\b/g, " subscription ")
    .replace(/\b\d{4,}\b/g, " ")
    .replace(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/g, " ")
    .replace(/\b(?:[a-z]{2,4}\.com|com|phl|ph|sgp|usa|us|irl|sg|my|hk|au)\b/g, " ")
    .replace(/\b(?:makati|taguig|pasig|quezon|mandaluyong|angeles|manila|city)\b/g, " ")
    .replace(/\b(?:branch|store|merchant|retail|digital|transaction|trx|memo|description|desc)\b/g, " ")
    .replace(/\b(pos|visa|mastercard|debit|credit|online|payment|pay|ph|inc|corp|co|ref|auth|card)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const buildMerchantFamilySignature = (value: string) => {
  const normalized = normalizeMerchantKey(value)
    .replace(recurringFamilyNoisePattern, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = normalized
    .split(" ")
    .filter((token) => token.length >= 3)
    .filter((token) => !/^\d+$/.test(token));

  if (tokens.length === 0) {
    return normalized;
  }

  return tokens.slice(0, 2).join(" ");
};

const canonicalizeRecurringMerchant = (value: string) => {
  const normalized = normalizeMerchantKey(value);
  for (const alias of recurringMerchantAliases) {
    if (alias.pattern.test(normalized)) {
      return alias.label;
    }
  }

  return normalized
    .replace(/\b(?:subscription|monthly|autopay|premium|membership|fee)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim() || buildMerchantFamilySignature(value);
};

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

const average = (values: number[]) => {
  const filtered = values.filter(Number.isFinite);
  return filtered.length > 0 ? filtered.reduce((sum, value) => sum + value, 0) / filtered.length : 0;
};

const ordinal = (value: number) =>
  `${value}${value % 10 === 1 && value % 100 !== 11 ? "st" : value % 10 === 2 && value % 100 !== 12 ? "nd" : value % 10 === 3 && value % 100 !== 13 ? "rd" : "th"}`;

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

export const makeRecurringSuppressionKey = (params: {
  accountId: string | null;
  currency: string | null;
  title: string | null;
}) =>
  [params.accountId ?? "workspace", (params.currency ?? "PHP").trim().toUpperCase() || "PHP", normalizeMerchantKey(params.title ?? "")]
    .join("::");

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
  const looksAnnualAcrossGaps =
    positiveMonthGaps.length > 0 &&
    sameDayOfMonthCount >= Math.min(2, sortedDates.length) &&
    positiveMonthGaps.every((gap) => gap >= 10 && gap <= 14);

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

  if ((typicalInterval >= 300 && typicalInterval <= 430) || looksAnnualAcrossGaps) {
    return { frequency: "annual", nextExpectedDate: addMonths(lastSeenDate, 12), cadenceConfidence: looksAnnualAcrossGaps ? 80 : 72 };
  }

  return { frequency: null, nextExpectedDate: null, cadenceConfidence: 0 };
};

const buildPatternFromTransactions = (
  transactions: RecurringSourceTransaction[],
  scope: "account" | "workspace"
): DetectedRecurringPattern | null => {
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

  const textBlob = expenseTransactions
    .map(
      (transaction) =>
        `${transaction.merchantClean ?? ""} ${transaction.merchantRaw} ${transaction.description ?? ""} ${transaction.category?.name ?? ""}`
    )
    .join(" ");
  const canonicalTitle =
    canonicalizeRecurringMerchant(
      expenseTransactions
        .map((transaction) => transaction.merchantClean ?? transaction.merchantRaw)
        .find((value) => Boolean(value && canonicalizeRecurringMerchant(value).length > 0)) ?? expenseTransactions[0]?.merchantRaw ?? ""
    ) || normalizeMerchantKey(expenseTransactions[0]?.merchantRaw ?? "");
  if (!canonicalTitle) {
    return null;
  }
  if (recurringNoiseTitlePattern.test(canonicalTitle)) {
    return null;
  }

  const amountTolerance = Math.max(20, typicalAmount * 0.18);
  const stableAmountCount = amounts.filter((amount) => Math.abs(amount - typicalAmount) <= amountTolerance).length;
  const amountStability = stableAmountCount / Math.max(amounts.length, 1);
  const categoryNames = new Set(expenseTransactions.map((transaction) => transaction.category?.name?.toLowerCase() ?? ""));
  const hasKeywordSignal = recurringKeywordPattern.test(textBlob) || categoryNames.has("bills & utilities");
  const looksTransferLike = recurringExclusionPattern.test(textBlob);
  const cadence = inferFrequency(expenseTransactions.map((transaction) => transaction.date));
  const dateDays = expenseTransactions.map((transaction) => transaction.date.getDate());
  const expectedDayOfMonth = cadence.frequency === "monthly" || cadence.frequency === "quarterly" || cadence.frequency === "annual"
    ? Math.round(median(dateDays))
    : null;
  const dayVariance =
    expectedDayOfMonth === null ? 0 : average(dateDays.map((day) => Math.abs(day - expectedDayOfMonth)));

  if (!cadence.frequency || !cadence.nextExpectedDate) {
    return null;
  }

  if (looksTransferLike && !hasKeywordSignal) {
    return null;
  }

  if (!hasKeywordSignal && !["monthly", "quarterly", "annual"].includes(cadence.frequency)) {
    return null;
  }

  if (!hasKeywordSignal && amountStability < 0.85) {
    return null;
  }

  if (!hasKeywordSignal && amountStability < 0.65 && expenseTransactions.length < 3) {
    return null;
  }

  const uniqueAccountKeys = new Set(
    expenseTransactions.map((transaction) =>
      [
        transaction.accountId ?? "",
        transaction.account?.institution ?? "",
        transaction.account?.name ?? "",
      ].join("::")
    )
  );
  const spansMultipleAccounts = uniqueAccountKeys.size > 1;
  if (scope === "workspace" && !spansMultipleAccounts) {
    return null;
  }

  const first = expenseTransactions[0] as RecurringSourceTransaction;
  const last = expenseTransactions[expenseTransactions.length - 1] as RecurringSourceTransaction;
  const reasonSummary = [
    cadence.frequency ? `${cadence.frequency} cadence` : null,
    expectedDayOfMonth !== null ? `around the ${ordinal(expectedDayOfMonth)}` : null,
    hasKeywordSignal ? "merchant looks like a bill or subscription" : null,
    amountStability >= 0.9 ? "amount stays very consistent" : amountStability >= 0.75 ? "amount stays fairly close" : null,
    spansMultipleAccounts ? "seen across multiple accounts" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const reasonTags = [
    cadence.frequency ? cadence.frequency : null,
    expectedDayOfMonth !== null ? "same date" : null,
    hasKeywordSignal ? "known merchant" : null,
    amountStability >= 0.9 ? "stable amount" : amountStability >= 0.75 ? "close amount" : null,
    spansMultipleAccounts ? "cross-account" : null,
  ].filter((value): value is string => Boolean(value));
  const suppressionKey = makeRecurringSuppressionKey({
    accountId: scope === "workspace" ? null : first.accountId,
    currency: first.currency,
    title: canonicalTitle,
  });
  const confidence = Math.min(
    96,
    Math.round(
      35 +
        Math.min(expenseTransactions.length, 6) * 7 +
        cadence.cadenceConfidence * 0.25 +
        amountStability * 20 +
        (expectedDayOfMonth !== null ? Math.max(0, 8 - Math.min(dayVariance, 8)) : 0) +
        (hasKeywordSignal ? 10 : 0) +
        (spansMultipleAccounts ? 6 : 0)
    )
  );

  if (confidence < 62) {
    return null;
  }

  return {
    workspaceId: first.workspaceId,
    accountId: scope === "workspace" && spansMultipleAccounts ? null : first.accountId,
    merchantRaw: first.merchantRaw,
    merchantClean: canonicalTitle,
    canonicalTitle,
    amount: Number(typicalAmount.toFixed(2)),
    minimumAmount: Number(Math.min(...amounts).toFixed(2)),
    maximumAmount: Number(Math.max(...amounts).toFixed(2)),
    currency: (first.currency ?? "PHP").trim().toUpperCase() || "PHP",
    frequency: cadence.frequency,
    firstSeenDate: first.date,
    lastSeenDate: last.date,
    nextExpectedDate: cadence.nextExpectedDate,
    expectedDayOfMonth,
    transactionCount: expenseTransactions.length,
    confidence,
    reasonSummary,
    reasonTags,
    suppressionKey,
    account: last.account ?? null,
    importFile: last.importFile ?? null,
    rawPayload: {
      source: "recurring_detection",
      scope,
      transactionIds: expenseTransactions.map((transaction) => transaction.id),
      amountStability,
      hasKeywordSignal,
      looksTransferLike,
      canonicalTitle,
      accountCount: uniqueAccountKeys.size,
      minimumAmount: Number(Math.min(...amounts).toFixed(2)),
      maximumAmount: Number(Math.max(...amounts).toFixed(2)),
      expectedDayOfMonth,
      dayVariance: Number(dayVariance.toFixed(2)),
      reasonSummary,
      reasonTags,
      suppressionKey,
    },
  };
};

export const detectRecurringPatterns = (transactions: RecurringSourceTransaction[]) => {
  const accountGroups = new Map<string, RecurringSourceTransaction[]>();
  const workspaceGroups = new Map<string, RecurringSourceTransaction[]>();

  for (const transaction of transactions) {
    if (transaction.type !== "expense") {
      continue;
    }

    const merchantKey =
      canonicalizeRecurringMerchant(transaction.merchantClean ?? transaction.merchantRaw) ||
      buildMerchantFamilySignature(transaction.merchantClean ?? transaction.merchantRaw) ||
      normalizeMerchantKey(transaction.merchantClean ?? transaction.merchantRaw);
    if (!merchantKey) {
      continue;
    }

    const currency = (transaction.currency ?? "PHP").trim().toUpperCase() || "PHP";
    const accountKey = `${transaction.workspaceId}::${transaction.accountId ?? "workspace"}::${currency}::${merchantKey}`;
    const workspaceKey = `${transaction.workspaceId}::workspace::${currency}::${merchantKey}`;
    accountGroups.set(accountKey, [...(accountGroups.get(accountKey) ?? []), transaction]);
    workspaceGroups.set(workspaceKey, [...(workspaceGroups.get(workspaceKey) ?? []), transaction]);
  }

  const patterns = [
    ...Array.from(accountGroups.values()).map((group) => buildPatternFromTransactions(group, "account")),
    ...Array.from(workspaceGroups.values()).map((group) => buildPatternFromTransactions(group, "workspace")),
  ].filter((pattern): pattern is DetectedRecurringPattern => Boolean(pattern));

  const dedupedPatterns = new Map<string, DetectedRecurringPattern>();
  for (const pattern of patterns) {
    const key = [pattern.currency, normalizeMerchantKey(pattern.canonicalTitle)].join("::");
    const existing = dedupedPatterns.get(key);
    if (
      !existing ||
      pattern.confidence > existing.confidence ||
      pattern.transactionCount > existing.transactionCount ||
      (pattern.accountId === null && existing.accountId !== null)
    ) {
      dedupedPatterns.set(key, pattern);
    }
  }

  return Array.from(dedupedPatterns.values())
    .filter((pattern): pattern is DetectedRecurringPattern => Boolean(pattern))
    .sort((left, right) => right.confidence - left.confidence || right.transactionCount - left.transactionCount);
};

const buildRecurringDedupKey = (transaction: RecurringSourceTransaction) =>
  [
    transaction.workspaceId,
    transaction.accountId ?? transaction.account?.name ?? "workspace",
    (transaction.currency ?? "PHP").trim().toUpperCase() || "PHP",
    transaction.date.toISOString().slice(0, 10),
    normalizeMerchantKey(transaction.merchantClean ?? transaction.merchantRaw),
    toAmount(transaction.amount).toFixed(2),
  ].join("::");

export const getRecurringSourceTransactions = async (workspaceId: string): Promise<RecurringSourceTransaction[]> => {
  const hasTransactionTable = await hasCompatibleTable("Transaction");
  const hasParsedTransactionTable = await hasCompatibleTable("ParsedTransaction");

  const [transactions, parsedTransactions] = await Promise.all([
    hasTransactionTable
      ? prisma.transaction.findMany({
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
            description: true,
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
              },
            },
            importFile: {
              select: {
                fileName: true,
              },
            },
          },
          orderBy: [{ date: "asc" }, { merchantClean: "asc" }, { merchantRaw: "asc" }],
          take: 1200,
        })
      : Promise.resolve([]),
    hasParsedTransactionTable
      ? prisma.parsedTransaction.findMany({
          where: {
            workspaceId,
            date: {
              gte: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
            },
          },
          select: {
            id: true,
            workspaceId: true,
            date: true,
            amount: true,
            currency: true,
            merchantRaw: true,
            merchantClean: true,
            categoryName: true,
            accountName: true,
            institution: true,
            importFile: {
              select: {
                fileName: true,
              },
            },
          },
          orderBy: [{ date: "asc" }, { merchantClean: "asc" }, { merchantRaw: "asc" }],
          take: 1200,
        })
      : Promise.resolve([]),
  ]);

  const normalizedTransactions: RecurringSourceTransaction[] = transactions.map((transaction) => ({
    id: transaction.id,
    workspaceId: transaction.workspaceId,
    accountId: transaction.accountId,
    date: transaction.date,
    amount: transaction.amount,
    currency: transaction.currency,
    type: transaction.type,
    merchantRaw: transaction.merchantRaw,
    merchantClean: transaction.merchantClean,
    description: transaction.description,
    category: transaction.category ?? null,
    account: transaction.account ?? null,
    importFile: transaction.importFile ?? null,
  }));

  const normalizedParsedTransactions: RecurringSourceTransaction[] = parsedTransactions.flatMap((transaction) => {
    if (!transaction.date || !transaction.merchantRaw || transaction.amount === null) {
      return [];
    }

    return [
      {
        id: `parsed:${transaction.id}`,
        workspaceId: transaction.workspaceId,
        accountId: null,
        date: transaction.date,
        amount: transaction.amount,
        currency: transaction.currency,
        type: "expense" as const,
        merchantRaw: transaction.merchantRaw,
        merchantClean: transaction.merchantClean,
        description: transaction.merchantRaw,
        category: transaction.categoryName ? { name: transaction.categoryName } : null,
        account: {
          id: null,
          name: transaction.accountName ?? null,
          institution: transaction.institution ?? null,
        },
        importFile: transaction.importFile ?? null,
      },
    ];
  });

  const combined: RecurringSourceTransaction[] = [...normalizedTransactions, ...normalizedParsedTransactions];

  const deduped = new Map<string, RecurringSourceTransaction>();
  for (const transaction of combined) {
    if (transaction.type !== "expense") {
      continue;
    }

    const key = buildRecurringDedupKey(transaction);
    if (!deduped.has(key)) {
      deduped.set(key, transaction);
    }
  }

  return Array.from(deduped.values()).sort(
    (left, right) => left.date.getTime() - right.date.getTime() || left.merchantRaw.localeCompare(right.merchantRaw)
  );
};

export const syncWorkspaceRecurringPatterns = async (workspaceId: string) => {
  if (!(await hasCompatibleTable("RecurringPattern"))) {
    return [];
  }

  const transactions = await getRecurringSourceTransactions(workspaceId);
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
  const dismissedPatterns = await prisma.recurringPattern.findMany({
    where: {
      workspaceId,
      rawPayload: {
        path: ["dismissed"],
        equals: true,
      },
    },
    select: {
      accountId: true,
      currency: true,
      merchantClean: true,
      merchantRaw: true,
      rawPayload: true,
    },
  });
  const dismissedSuppressionKeys = new Set(
    dismissedPatterns.map((pattern) => {
      const payload =
        pattern.rawPayload && typeof pattern.rawPayload === "object" && !Array.isArray(pattern.rawPayload)
          ? (pattern.rawPayload as Record<string, unknown>)
          : null;
      return typeof payload?.suppressionKey === "string"
        ? payload.suppressionKey
        : makeRecurringSuppressionKey({
            accountId: pattern.accountId,
            currency: pattern.currency,
            title: pattern.merchantClean ?? pattern.merchantRaw,
          });
    })
  );

  const patterns = detectedPatterns.filter((pattern) => {
    const key = [pattern.accountId ?? "workspace", pattern.currency, normalizeMerchantKey(pattern.canonicalTitle)].join("::");
    return !existingCommitmentKeys.has(key) && !dismissedSuppressionKeys.has(pattern.suppressionKey);
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
            merchantClean: pattern.canonicalTitle,
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
          data: {
            workspaceId: pattern.workspaceId,
            accountId: pattern.accountId,
            merchantRaw: pattern.merchantRaw,
            merchantClean: pattern.canonicalTitle,
            amount: pattern.amount,
            currency: pattern.currency,
            frequency: pattern.frequency,
            firstSeenDate: pattern.firstSeenDate,
            lastSeenDate: pattern.lastSeenDate,
            nextExpectedDate: pattern.nextExpectedDate,
            transactionCount: pattern.transactionCount,
            confidence: pattern.confidence,
            rawPayload: pattern.rawPayload,
          },
        });
      }
    }
  });

  return patterns;
};
