import { type CommitmentRecurrence, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasCompatibleTable } from "@/lib/data-engine";
import { getUpcomingStatementReminders, type StatementReminder } from "@/lib/statement-reminders";
import { detectRecurringPatterns } from "@/lib/recurring-detection";

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
  confidence: number;
  sourceFileName: string | null;
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

const addMonths = (date: Date, months: number) => {
  const next = new Date(date);
  const day = next.getDate();
  next.setMonth(next.getMonth() + months, 1);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
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
      confidence: Math.min(94, 66 + Math.min(group.length, 3) * 8 + (installmentTerms ? 8 : 0)),
      sourceFileName: readTransactionImportFileName(first),
    });
  }

  return suggestions;
};

const getDetectedPatternTransactionIds = (rawPayload: unknown) => {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return [];
  }

  const transactionIds = (rawPayload as Record<string, unknown>).transactionIds;
  return Array.isArray(transactionIds) ? transactionIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0) : [];
};

const buildRecurringTransactionSuggestions = (
  transactions: PlannedPaymentTransactionLike[],
  existingCommitmentKeys: Set<string>,
  existingRecurringPatternKeys: Set<string>
): PlannedPaymentSuggestion[] => {
  const accountNames = new Map(transactions.map((transaction) => [transaction.account.id, transaction.account.name]));
  const patterns = detectRecurringPatterns(transactions);
  const suggestions: PlannedPaymentSuggestion[] = [];

  for (const pattern of patterns) {
    const title = (pattern.merchantClean ?? pattern.merchantRaw).trim();
    const currency = (pattern.currency ?? "PHP").trim().toUpperCase() || "PHP";
    const merchantKey = normalizeKey(title);
    const accountKey = pattern.accountId ?? "workspace";
    const keyParts = [accountKey, currency, merchantKey];
    const commitmentKey = keyParts.join("::");
    const recurringPatternKey = commitmentKey;

    if (!title || existingCommitmentKeys.has(commitmentKey) || existingRecurringPatternKeys.has(recurringPatternKey)) {
      continue;
    }

    const transactionIds = getDetectedPatternTransactionIds(pattern.rawPayload);
    const suggestionId = `recurring_transaction::${commitmentKey}`;
    const lastSeenDate = pattern.lastSeenDate ? new Date(pattern.lastSeenDate) : null;
    const nextExpectedDate = pattern.nextExpectedDate ? new Date(pattern.nextExpectedDate) : null;

    suggestions.push({
      id: suggestionId,
      sourceKind: "recurring_transaction",
      title,
      counterparty: title,
      amount: pattern.amount ? pattern.amount.toFixed(2) : null,
      currency,
      dueDate: nextExpectedDate?.toISOString() ?? null,
      recurrence: pattern.frequency ?? "monthly",
      accountId: pattern.accountId,
      accountName: pattern.accountId ? accountNames.get(pattern.accountId) ?? null : null,
      statementCheckpointId: null,
      installmentTerms: null,
      notes: [
        `Detected from ${pattern.transactionCount} matching transaction${pattern.transactionCount === 1 ? "" : "s"}.`,
        transactionIds.length > 0 ? `Matched transaction IDs: ${transactionIds.slice(0, 4).join(", ")}${transactionIds.length > 4 ? ", ..." : ""}.` : null,
      ]
        .filter(Boolean)
        .join(" "),
      sourceLabel: "Potential recurring",
      sourceDetail: pattern.transactionCount > 1
        ? `Seen ${pattern.transactionCount} times`
        : lastSeenDate
          ? `Last seen ${new Intl.DateTimeFormat("en-PH", { month: "short", day: "2-digit", year: "numeric" }).format(lastSeenDate)}`
          : null,
      confidence: pattern.confidence,
      sourceFileName: null,
    });
  }

  return suggestions;
};

export const getPlannedPaymentSuggestions = async (workspaceId: string) => {
  const reminders = await getUpcomingStatementReminders(workspaceId);
  const hasCommitmentTable = await hasCompatibleTable("FinancialCommitment");
  const hasTransactionTable = await hasCompatibleTable("Transaction");
  const hasRecurringPatternTable = await hasCompatibleTable("RecurringPattern");

  const [existingCommitments, existingRecurringPatterns, transactions] = await Promise.all([
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
            currency: string;
            statementCheckpointId: string | null;
          }>
        ),
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
          select: {
            accountId: true,
            currency: true,
            merchantClean: true,
            merchantRaw: true,
          },
        })
      : Promise.resolve(
          [] as Array<{
            accountId: string | null;
            currency: string;
            merchantClean: string | null;
            merchantRaw: string;
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
  ]);

  const existingCheckpointIds = new Set(
    existingCommitments.map((commitment) => commitment.statementCheckpointId).filter((value): value is string => Boolean(value))
  );
  const existingInstallmentKeys = new Set(
    existingCommitments.map((commitment) =>
      `installment::${[commitment.accountId ?? "workspace", normalizeKey(`${commitment.counterparty ?? commitment.title}`)].join("::")}`
    )
  );
  const existingRecurringCommitmentKeys = new Set(
    existingCommitments.map((commitment) =>
      [
        commitment.accountId ?? "workspace",
        (commitment.currency ?? "PHP").trim().toUpperCase() || "PHP",
        normalizeKey(`${commitment.counterparty ?? commitment.title}`),
      ].join("::")
    )
  );
  const existingRecurringPatternKeys = new Set(
    existingRecurringPatterns.map((pattern) =>
      [
        pattern.accountId ?? "workspace",
        (pattern.currency ?? "PHP").trim().toUpperCase() || "PHP",
        normalizeKey(pattern.merchantClean ?? pattern.merchantRaw),
      ].join("::")
    )
  );

  const reminderSuggestions = buildReminderSuggestions(reminders, existingCheckpointIds);
  const installmentSuggestions = buildInstallmentSuggestions(
    transactions as PlannedPaymentTransactionLike[],
    reminders,
    existingInstallmentKeys
  );
  const recurringTransactionSuggestions = buildRecurringTransactionSuggestions(
    transactions as PlannedPaymentTransactionLike[],
    existingRecurringCommitmentKeys,
    existingRecurringPatternKeys
  );

  return [...reminderSuggestions, ...installmentSuggestions, ...recurringTransactionSuggestions].sort(
    (left, right) =>
      new Date(left.dueDate ?? 0).getTime() - new Date(right.dueDate ?? 0).getTime() ||
      right.confidence - left.confidence ||
      left.title.localeCompare(right.title)
  );
};
