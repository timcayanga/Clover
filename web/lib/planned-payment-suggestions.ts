import { type CommitmentRecurrence, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasCompatibleTable } from "@/lib/data-engine";
import { getUpcomingStatementReminders, type StatementReminder } from "@/lib/statement-reminders";
import { detectRecurringPatterns, getRecurringSourceTransactions, makeRecurringSuppressionKey } from "@/lib/recurring-detection";

type PlannedPaymentTransactionLike = {
  id: string;
  workspaceId: string;
  accountId: string | null;
  date: Date;
  amount: unknown;
  currency: string | null;
  type: "income" | "expense" | "transfer";
  merchantRaw: string;
  merchantClean: string | null;
  description: string | null;
  rawPayload: Prisma.JsonValue;
  importFileId: string | null;
  account: {
    id: string;
    name: string;
    institution: string | null;
  };
};

export type PlannedPaymentSuggestion = {
  id: string;
  sourceKind: "statement_reminder" | "installment" | "recurring_transaction";
  title: string;
  counterparty: string | null;
  amount: string | null;
  currency: string;
  dueDate: string | null;
  recurrence: CommitmentRecurrence;
  accountId: string | null;
  accountName: string | null;
  statementCheckpointId: string | null;
  installmentTerms: string | null;
  notes: string | null;
  sourceLabel: string;
  sourceDetail: string | null;
  reasonSummary: string | null;
  reasonTags: string[];
  confidence: number;
  sourceFileName: string | null;
};

type ConfirmedRecurringMemory = {
  normalizedKey: string;
  recurrence: CommitmentRecurrence;
  nextDueDate: Date | null;
  dueDate: Date | null;
  accountId: string | null;
  currency: string;
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const INSTALLMENT_SIGNAL = /\b(installment|amortization|credit-?to-?cash|sip balance|balance summary)\b/i;

const normalizeWhitespace = (value: string) => value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

const normalizeKey = (value: string | null | undefined) =>
  normalizeWhitespace(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const parseAmount = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.abs(parsed) : 0;
};

const formatAmountRange = (minimumAmount: number | null, maximumAmount: number | null, currency: string) => {
  if (minimumAmount === null || maximumAmount === null) {
    return null;
  }

  const formatter = new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: currency || "PHP",
    minimumFractionDigits: 2,
  });

  if (Math.abs(minimumAmount - maximumAmount) < 0.01) {
    return formatter.format(minimumAmount);
  }

  return `${formatter.format(minimumAmount)} to ${formatter.format(maximumAmount)}`;
};

const addMonths = (date: Date, months: number) => {
  const next = new Date(date);
  const day = next.getDate();
  next.setMonth(next.getMonth() + months, 1);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
};

const absoluteDayDistance = (left: Date, right: Date) => Math.round(Math.abs(right.getTime() - left.getTime()) / DAY_IN_MS);

const selectRememberedDueDate = (patternDueDate: Date, memory: ConfirmedRecurringMemory | null) => {
  if (!memory) {
    return patternDueDate;
  }

  const candidates = [memory.nextDueDate, memory.dueDate].filter((value): value is Date => Boolean(value));
  for (const candidate of candidates) {
    if (candidate.getTime() > Date.now() - DAY_IN_MS && absoluteDayDistance(candidate, patternDueDate) <= 45) {
      return candidate;
    }
  }

  return patternDueDate;
};

const getReminderKey = (reminder: StatementReminder) =>
  normalizeKey([reminder.accountName, reminder.institution ?? ""].filter(Boolean).join(" "));

const getTransactionText = (transaction: PlannedPaymentTransactionLike) =>
  [
    transaction.merchantClean ?? "",
    transaction.merchantRaw ?? "",
    transaction.description ?? "",
    typeof transaction.rawPayload === "object" && transaction.rawPayload !== null && !Array.isArray(transaction.rawPayload)
      ? [
          (transaction.rawPayload as Record<string, unknown>).description,
          (transaction.rawPayload as Record<string, unknown>).line,
          (transaction.rawPayload as Record<string, unknown>).memo,
        ]
          .filter((value): value is string => typeof value === "string")
          .join(" ")
      : "",
  ]
    .filter(Boolean)
    .join(" ");

const extractInstallmentTerms = (text: string) => {
  const normalized = text.replace(/\s+/g, " ");
  const explicitMatch = normalized.match(/\b(?:of|\/)\s*(\d{1,3})\s*(?:months?|payments?|installments?)\b/i);
  if (explicitMatch?.[1]) {
    return Number(explicitMatch[1]);
  }

  const compactMatch = normalized.match(/\b(\d{1,3})\s*\/\s*(\d{1,3})\s*(?:installments?|payments?)\b/i);
  if (compactMatch?.[2]) {
    return Number(compactMatch[2]);
  }

  const xOfYMatch = normalized.match(/\b(\d{1,3})\s*of\s*(\d{1,3})\s*(?:installments?|payments?)\b/i);
  if (xOfYMatch?.[2]) {
    return Number(xOfYMatch[2]);
  }

  return null;
};

const readTransactionImportFileName = (transaction: PlannedPaymentTransactionLike) => {
  const rawPayload = transaction.rawPayload;
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }

  const fileName = (rawPayload as Record<string, unknown>).sourceFileName;
  return typeof fileName === "string" && fileName.trim() ? fileName.trim() : null;
};

const buildReminderSuggestions = (reminders: StatementReminder[], existingCheckpointIds: Set<string>) => {
  const suggestions: PlannedPaymentSuggestion[] = [];

  for (const reminder of reminders) {
    const dueDate = new Date(reminder.paymentDueDate);
    if (existingCheckpointIds.has(reminder.checkpointId)) {
      continue;
    }
    const key = `statement_reminder::${reminder.checkpointId}`;

    suggestions.push({
      id: key,
      sourceKind: "statement_reminder",
      title: `${reminder.accountName} payment`,
      counterparty: reminder.accountName,
      amount: reminder.totalAmountDue.toFixed(2),
      currency: (reminder.currency ?? "PHP").trim().toUpperCase() || "PHP",
      dueDate: dueDate.toISOString(),
      recurrence: "monthly",
      accountId: reminder.accountId,
      accountName: reminder.accountName,
      statementCheckpointId: reminder.checkpointId,
      installmentTerms: null,
      notes:
        reminder.statementStartDate || reminder.statementEndDate
          ? `Statement ${reminder.statementStartDate ?? "start"} to ${reminder.statementEndDate ?? "end"}; due from ${reminder.sourceFileName ?? "uploaded statement"}.`
          : `Due from ${reminder.sourceFileName ?? "uploaded statement"}.`,
      sourceLabel: "Statement due date",
      sourceDetail: `Due ${new Intl.DateTimeFormat("en-PH", { month: "short", day: "2-digit", year: "numeric" }).format(dueDate)}`,
      reasonSummary: "Detected from an uploaded statement due date.",
      reasonTags: ["statement due date", "uploaded file"],
      confidence: 92,
      sourceFileName: reminder.sourceFileName,
    });

  }

  return suggestions;
};

const buildInstallmentSuggestions = (
  transactions: PlannedPaymentTransactionLike[],
  reminders: StatementReminder[],
  existingCommitmentKeys: Set<string>
) => {
  const reminderByAccountId = new Map<string, StatementReminder>();
  const reminderByAccountKey = new Map<string, StatementReminder>();

  for (const reminder of reminders) {
    if (reminder.accountId) {
      reminderByAccountId.set(reminder.accountId, reminder);
    }
    reminderByAccountKey.set(getReminderKey(reminder), reminder);
  }

  const grouped = new Map<string, PlannedPaymentTransactionLike[]>();

  for (const transaction of transactions) {
    if (transaction.type !== "expense") {
      continue;
    }

    const text = getTransactionText(transaction);
    if (!INSTALLMENT_SIGNAL.test(text)) {
      continue;
    }

    const merchantKey = normalizeKey(transaction.merchantClean ?? transaction.merchantRaw ?? transaction.description ?? "installment");
    if (!merchantKey) {
      continue;
    }

    const groupKey = [transaction.accountId ?? transaction.account.name, transaction.currency ?? "PHP", merchantKey].join("::");
    grouped.set(groupKey, [...(grouped.get(groupKey) ?? []), transaction]);
  }

  const suggestions: PlannedPaymentSuggestion[] = [];

  for (const [groupKey, group] of grouped.entries()) {
    if (group.length === 0) {
      continue;
    }

    const first = group[0] as PlannedPaymentTransactionLike;
    const last = group[group.length - 1] as PlannedPaymentTransactionLike;
    const title = (first.merchantClean ?? first.merchantRaw ?? first.description ?? "Installment").trim();
    const amount = group.reduce((sum, transaction) => sum + parseAmount(transaction.amount), 0) / group.length;
    const reminder =
      (first.accountId ? reminderByAccountId.get(first.accountId) : null) ??
      reminderByAccountKey.get(normalizeKey([first.account.name, first.account.institution ?? ""].filter(Boolean).join(" "))) ??
      null;
    const dueDate = reminder ? new Date(reminder.paymentDueDate) : addMonths(last.date, 1);
    const installmentTerms = extractInstallmentTerms(getTransactionText(first));
    const key = `installment::${groupKey}`;

    if (existingCommitmentKeys.has(key)) {
      continue;
    }

    suggestions.push({
      id: key,
      sourceKind: "installment",
      title,
      counterparty: title,
      amount: amount > 0 ? amount.toFixed(2) : null,
      currency: (first.currency ?? "PHP").trim().toUpperCase() || "PHP",
      dueDate: dueDate.toISOString(),
      recurrence: "monthly",
      accountId: first.accountId,
      accountName: first.account.name,
      statementCheckpointId: reminder?.checkpointId ?? null,
      installmentTerms: installmentTerms ? `${installmentTerms} month${installmentTerms === 1 ? "" : "s"}` : null,
      notes: [
        `Detected from ${group.length} installment transaction${group.length === 1 ? "" : "s"}.`,
        reminder?.sourceFileName ? `Linked to ${reminder.sourceFileName}.` : null,
      ]
        .filter(Boolean)
        .join(" "),
      sourceLabel: "Installment detected",
      sourceDetail: reminder
        ? `Due ${new Intl.DateTimeFormat("en-PH", { month: "short", day: "2-digit", year: "numeric" }).format(dueDate)}`
        : `Last seen ${new Intl.DateTimeFormat("en-PH", { month: "short", day: "2-digit", year: "numeric" }).format(last.date)}`,
      reasonSummary: installmentTerms ? `Installment terms suggest ${installmentTerms} payments.` : "Repeated installment-style charges were detected.",
      reasonTags: installmentTerms ? ["installment terms", "repeated charge"] : ["installment signal", "repeated charge"],
      confidence: Math.min(94, 66 + Math.min(group.length, 3) * 8 + (installmentTerms ? 8 : 0)),
      sourceFileName: readTransactionImportFileName(first),
    });
  }

  return suggestions;
};

const buildRecurringTransactionSuggestions = (
  transactions: Awaited<ReturnType<typeof getRecurringSourceTransactions>>,
  existingCommitmentKeys: Set<string>,
  dismissedSuppressionKeys: Set<string>,
  confirmedRecurringMemoryByTitle: Map<string, ConfirmedRecurringMemory[]>
) => {
  const suggestions: PlannedPaymentSuggestion[] = [];
  const patterns = detectRecurringPatterns(transactions).filter((pattern) => pattern.transactionCount >= 2);

  for (const pattern of patterns) {
    const title = (pattern.canonicalTitle || pattern.merchantClean || pattern.merchantRaw).trim();
    const key = `recurring_transaction::${[
      pattern.accountId ?? "workspace",
      pattern.currency,
      normalizeKey(title),
    ].join("::")}`;
    if (existingCommitmentKeys.has(key) || dismissedSuppressionKeys.has(pattern.suppressionKey)) {
      continue;
    }

    const amountRange = formatAmountRange(pattern.minimumAmount ?? null, pattern.maximumAmount ?? null, pattern.currency);
    const scheduleDetail =
      pattern.expectedDayOfMonth && ["monthly", "quarterly", "annual"].includes(pattern.frequency)
        ? `${pattern.frequency} around the ${pattern.expectedDayOfMonth}${pattern.expectedDayOfMonth === 1 ? "st" : pattern.expectedDayOfMonth === 2 ? "nd" : pattern.expectedDayOfMonth === 3 ? "rd" : "th"}`
        : pattern.frequency;
    const normalizedTitle = normalizeKey(title);
    const confirmedMatches = confirmedRecurringMemoryByTitle.get(normalizedTitle) ?? [];
    const confirmedMatch =
      confirmedMatches.find(
        (memory) =>
          memory.currency === pattern.currency &&
          (memory.accountId === null || pattern.accountId === null || memory.accountId === pattern.accountId)
      ) ?? confirmedMatches[0] ?? null;
    const hasConfirmedMatch = Boolean(confirmedMatch);
    const dueDate = selectRememberedDueDate(pattern.nextExpectedDate, confirmedMatch);

    suggestions.push({
      id: key,
      sourceKind: "recurring_transaction",
      title,
      counterparty: title,
      amount: pattern.amount > 0 ? pattern.amount.toFixed(2) : null,
      currency: pattern.currency,
      dueDate: dueDate.toISOString(),
      recurrence: confirmedMatch?.recurrence ?? pattern.frequency,
      accountId: pattern.accountId,
      accountName: pattern.account?.name ?? null,
      statementCheckpointId: null,
      installmentTerms: null,
      notes: [
        `Detected from ${pattern.transactionCount} similar transaction${pattern.transactionCount === 1 ? "" : "s"} across recent uploads.`,
        amountRange ? `Usually ${amountRange}.` : null,
      ]
        .filter(Boolean)
        .join(" "),
      sourceLabel: "Recurring transaction",
      sourceDetail: [
        scheduleDetail ? `Looks ${scheduleDetail}` : null,
        hasConfirmedMatch ? "matched your saved recurring item" : null,
        `Seen through ${new Intl.DateTimeFormat("en-PH", { month: "short", day: "2-digit", year: "numeric" }).format(pattern.lastSeenDate)}`,
      ]
        .filter(Boolean)
        .join(" · "),
      reasonSummary: hasConfirmedMatch ? `${pattern.reasonSummary} · matched your saved recurring schedule` : pattern.reasonSummary,
      reasonTags: hasConfirmedMatch ? [...pattern.reasonTags, "confirmed before", "saved schedule"] : pattern.reasonTags,
      confidence: Math.min(98, pattern.confidence + (hasConfirmedMatch ? 6 : 0)),
      sourceFileName: pattern.importFile?.fileName ?? null,
    });
  }

  return suggestions;
};

export const getPlannedPaymentSuggestions = async (workspaceId: string) => {
  const reminders = await getUpcomingStatementReminders(workspaceId);
  const hasCommitmentTable = await hasCompatibleTable("FinancialCommitment");
  const hasTransactionTable = await hasCompatibleTable("Transaction");
  const hasRecurringPatternTable = await hasCompatibleTable("RecurringPattern");
  const recurringTransactions = await getRecurringSourceTransactions(workspaceId);

  const [existingCommitments, transactions, dismissedPatterns, confirmedRecurringCommitments] = await Promise.all([
    hasCommitmentTable
      ? prisma.financialCommitment.findMany({
          where: {
            workspaceId,
            status: { not: "resolved" },
          },
          select: {
            id: true,
            title: true,
            counterparty: true,
            accountId: true,
            currency: true,
            statementCheckpointId: true,
          },
        })
      : Promise.resolve(
          [] as Array<{
            title: string;
            counterparty: string | null;
            accountId: string | null;
            currency: string | null;
            statementCheckpointId: string | null;
          }>
        ),
    hasTransactionTable
      ? prisma.transaction.findMany({
          where: {
            workspaceId,
            deletedAt: null,
            isExcluded: false,
            type: "expense",
            date: {
              gte: new Date(Date.now() - 400 * DAY_IN_MS),
            },
          },
          orderBy: [{ date: "asc" }, { merchantClean: "asc" }, { merchantRaw: "asc" }],
          take: 1200,
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
            rawPayload: true,
            importFileId: true,
            account: {
              select: {
                id: true,
                name: true,
                institution: true,
              },
            },
          },
        })
      : Promise.resolve([] as PlannedPaymentTransactionLike[]),
    hasRecurringPatternTable
      ? prisma.recurringPattern.findMany({
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
        })
      : Promise.resolve([]),
    hasCommitmentTable
      ? prisma.financialCommitment.findMany({
          where: {
            workspaceId,
            status: { not: "resolved" },
            recurrence: { not: "once" },
          },
          select: {
            title: true,
            counterparty: true,
            accountId: true,
            currency: true,
            recurrence: true,
            dueDate: true,
            nextDueDate: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const existingCheckpointIds = new Set(
    existingCommitments.map((commitment) => commitment.statementCheckpointId).filter((value): value is string => Boolean(value))
  );
  const existingInstallmentKeys = new Set(
    existingCommitments.map((commitment) =>
      `installment::${[commitment.accountId ?? "workspace", normalizeKey(`${commitment.counterparty ?? commitment.title}`)].join("::")}`
    )
  );
  const existingRecurringTransactionKeys = new Set(
    existingCommitments.map((commitment) =>
      `recurring_transaction::${[
        commitment.accountId ?? "workspace",
        (commitment.currency ?? "PHP").toUpperCase(),
        normalizeKey(`${commitment.counterparty ?? commitment.title}`),
      ].join("::")}`
    )
  );
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
  const confirmedRecurringMemoryByTitle = new Map<string, ConfirmedRecurringMemory[]>();
  for (const commitment of confirmedRecurringCommitments) {
    const keys = [normalizeKey(commitment.title), normalizeKey(commitment.counterparty ?? "")].filter(Boolean);
    for (const normalizedKey of keys) {
      confirmedRecurringMemoryByTitle.set(normalizedKey, [
        ...(confirmedRecurringMemoryByTitle.get(normalizedKey) ?? []),
        {
          normalizedKey,
          recurrence: commitment.recurrence,
          nextDueDate: commitment.nextDueDate,
          dueDate: commitment.dueDate,
          accountId: commitment.accountId,
          currency: (commitment.currency ?? "PHP").toUpperCase(),
        },
      ]);
    }
  }

  const reminderSuggestions = buildReminderSuggestions(reminders, existingCheckpointIds);
  const installmentSuggestions = buildInstallmentSuggestions(
    transactions as PlannedPaymentTransactionLike[],
    reminders,
    existingInstallmentKeys
  );
  const recurringTransactionSuggestions = buildRecurringTransactionSuggestions(
    recurringTransactions,
    existingRecurringTransactionKeys,
    dismissedSuppressionKeys,
    confirmedRecurringMemoryByTitle
  );

  return [...reminderSuggestions, ...installmentSuggestions, ...recurringTransactionSuggestions].sort(
    (left, right) =>
      new Date(left.dueDate ?? 0).getTime() - new Date(right.dueDate ?? 0).getTime() ||
      right.confidence - left.confidence ||
      left.title.localeCompare(right.title)
  );
};
