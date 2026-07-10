import { prisma } from "@/lib/prisma";
import { hasCompatibleTable } from "@/lib/data-engine";

const CREDIT_CARD_REMINDER_INSTITUTIONS = new Set(["BPI", "AUB", "RCBC"]);
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const REMINDER_RECENCY_WINDOW_DAYS = 450;

export type StatementReminder = {
  checkpointId: string;
  accountId: string | null;
  accountName: string;
  institution: string | null;
  currency: string | null;
  statementStartDate: string | null;
  statementEndDate: string | null;
  paymentDueDate: string;
  totalAmountDue: number;
  sourceFileName: string | null;
  daysUntilDue: number;
  dueDayOfMonth: number | null;
  detectionSource: "explicit" | "inferred_history" | "projected";
};

type ReminderCheckpoint = {
  id: string;
  accountId: string | null;
  statementStartDate: Date | null;
  statementEndDate: Date | null;
  endingBalance: unknown;
  createdAt: Date;
  sourceMetadata: unknown;
  account: {
    id: string;
    name: string;
    institution: string | null;
    type: string;
    currency: string | null;
  } | null;
  importFile: {
    fileName: string;
  } | null;
};

const normalizeWhitespace = (value: string) => value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

const normalizeAccountKey = (accountName?: string | null, institution?: string | null) =>
  normalizeWhitespace(`${institution ?? ""} ${accountName ?? ""}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const parseAmountValue = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.replace(/[^0-9.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === "." || cleaned === "-.") {
    return null;
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseReminderDate = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toUtcMidday = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12, 0, 0, 0));

const addMonths = (date: Date, months: number) => {
  const next = new Date(date);
  const day = next.getDate();
  next.setMonth(next.getMonth() + months, 1);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
};

const rollDateForwardMonthly = (date: Date, minTimestamp: number) => {
  let next = toUtcMidday(date);
  let guard = 0;
  while (next.getTime() <= minTimestamp && guard < 240) {
    next = toUtcMidday(addMonths(next, 1));
    guard += 1;
  }
  return next;
};

const extractSourceMetadata = (checkpoint: ReminderCheckpoint) => {
  if (!checkpoint.sourceMetadata || typeof checkpoint.sourceMetadata !== "object" || Array.isArray(checkpoint.sourceMetadata)) {
    return null;
  }

  return checkpoint.sourceMetadata as Record<string, unknown>;
};

const readExplicitPaymentDueDate = (sourceMetadata: Record<string, unknown> | null, checkpoint: ReminderCheckpoint) => {
  const candidates = [
    sourceMetadata?.paymentDueDate,
    sourceMetadata?.dueDate,
    sourceMetadata?.statementDueDate,
    sourceMetadata?.payment_date,
    sourceMetadata?.due_date,
    sourceMetadata?.payment_due_date,
    sourceMetadata?.nextPaymentDueDate,
    sourceMetadata?.next_due_date,
    sourceMetadata?.due,
    sourceMetadata?.paymentDue,
    sourceMetadata?.payment_due,
    sourceMetadata?.paymentDueOn,
    sourceMetadata?.payment_due_on,
    sourceMetadata?.dueOn,
    sourceMetadata?.due_on,
    sourceMetadata?.amountDueDate,
    sourceMetadata?.amount_due_date,
  ];

  for (const candidate of candidates) {
    const parsed = parseReminderDate(candidate);
    if (parsed) {
      return parsed;
    }
  }

  const institution = String(sourceMetadata?.institution ?? checkpoint.account?.institution ?? "");
  const fallbackValue =
    CREDIT_CARD_REMINDER_INSTITUTIONS.has(institution)
      ? sourceMetadata?.endDate ?? checkpoint.statementEndDate?.toISOString() ?? null
      : null;
  return parseReminderDate(fallbackValue);
};

const readExplicitDueDay = (sourceMetadata: Record<string, unknown> | null) => {
  const candidates = [
    sourceMetadata?.dueDayOfMonth,
    sourceMetadata?.due_day_of_month,
    sourceMetadata?.paymentDueDay,
    sourceMetadata?.payment_due_day,
    sourceMetadata?.dueDay,
    sourceMetadata?.due_day,
  ];

  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 31) {
      return Math.round(parsed);
    }
  }

  return null;
};

const inferDueDateFromHistory = (
  statementEndDate: Date | null,
  knownDueDays: number[],
  knownLagsInDays: number[]
) => {
  if (!statementEndDate) {
    return null;
  }

  const normalizedStatementEndDate = toUtcMidday(statementEndDate);
  if (knownLagsInDays.length > 0) {
    const sortedLags = [...knownLagsInDays].sort((left, right) => left - right);
    const lag = sortedLags[Math.floor((sortedLags.length - 1) / 2)] ?? sortedLags[0] ?? 0;
    if (lag > 0) {
      return new Date(normalizedStatementEndDate.getTime() + lag * DAY_IN_MS);
    }
  }

  if (knownDueDays.length === 0) {
    return null;
  }

  const sortedDays = [...knownDueDays].sort((left, right) => left - right);
  const inferredDay = sortedDays[Math.floor((sortedDays.length - 1) / 2)] ?? sortedDays[0] ?? 1;
  const baseDate = new Date(normalizedStatementEndDate);
  baseDate.setUTCDate(Math.min(inferredDay, 28));
  return baseDate.getTime() <= normalizedStatementEndDate.getTime() ? addMonths(baseDate, 1) : baseDate;
};

const inferCreditCardCheckpoint = (checkpoint: ReminderCheckpoint, sourceMetadata: Record<string, unknown> | null) => {
  const explicitAccountType =
    typeof sourceMetadata?.accountType === "string"
      ? sourceMetadata.accountType.trim().toLowerCase()
      : checkpoint.account?.type?.trim().toLowerCase() ?? null;
  if (explicitAccountType === "credit_card") {
    return true;
  }

  const text = [
    checkpoint.importFile?.fileName ?? "",
    typeof sourceMetadata?.accountName === "string" ? sourceMetadata.accountName : "",
    typeof sourceMetadata?.institution === "string" ? sourceMetadata.institution : "",
  ]
    .join(" ")
    .toLowerCase();

  return /\b(visa|mastercard|amex|jcb|bankard|credit\s*card|platinum|world|black)\b/.test(text);
};

const buildReminderFingerprint = (reminder: StatementReminder) =>
  [
    normalizeWhitespace(reminder.institution ?? "unknown").toLowerCase(),
    reminder.currency ?? "PHP",
    reminder.dueDayOfMonth ?? 0,
    Math.round(reminder.totalAmountDue * 100),
    reminder.statementEndDate ? reminder.statementEndDate.slice(0, 10) : "no-statement-end",
  ].join("::");

const scoreReminderSpecificity = (reminder: StatementReminder) => {
  let score = 0;
  if (reminder.accountId) {
    score += 6;
  }
  if (/\d{4}/.test(reminder.accountName)) {
    score += 4;
  }
  if (reminder.sourceFileName?.toLowerCase().endsWith(".pdf")) {
    score += 2;
  }
  return score;
};

export const getUpcomingStatementReminders = async (workspaceId: string): Promise<StatementReminder[]> => {
  if (!(await hasCompatibleTable("AccountStatementCheckpoint"))) {
    return [];
  }

  const checkpoints = (await prisma.accountStatementCheckpoint.findMany({
    where: { workspaceId },
    orderBy: [
      { statementEndDate: "desc" },
      { createdAt: "desc" },
    ],
    select: {
      id: true,
      accountId: true,
      statementStartDate: true,
      statementEndDate: true,
      endingBalance: true,
      createdAt: true,
      sourceMetadata: true,
    account: {
      select: {
        id: true,
        name: true,
        institution: true,
        type: true,
        currency: true,
      },
    },
      importFile: {
        select: {
          fileName: true,
        },
      },
    },
  })) as ReminderCheckpoint[];

  const now = Date.now();
  const recencyCutoff = now - REMINDER_RECENCY_WINDOW_DAYS * DAY_IN_MS;
  const remindersByAccountKey = new Map<string, StatementReminder>();
  const knownDueDaysByAccountKey = new Map<string, number[]>();
  const knownLagDaysByAccountKey = new Map<string, number[]>();

  for (const checkpoint of checkpoints) {
    const sourceMetadata = extractSourceMetadata(checkpoint);
    const institution = typeof sourceMetadata?.institution === "string" ? sourceMetadata.institution : checkpoint.account?.institution ?? null;
    const accountName =
      typeof sourceMetadata?.accountName === "string" && sourceMetadata.accountName.trim()
        ? sourceMetadata.accountName.trim()
        : checkpoint.account?.name ?? checkpoint.importFile?.fileName ?? "Credit card";
    const accountKey = normalizeAccountKey(
      checkpoint.account?.name ?? (typeof sourceMetadata?.accountName === "string" ? sourceMetadata.accountName : accountName),
      institution
    );
    const explicitDueDate = readExplicitPaymentDueDate(sourceMetadata, checkpoint);
    const explicitDueDay = readExplicitDueDay(sourceMetadata);
    if (!explicitDueDate && !explicitDueDay) {
      continue;
    }
    if (explicitDueDate) {
      knownDueDaysByAccountKey.set(accountKey, [...(knownDueDaysByAccountKey.get(accountKey) ?? []), explicitDueDate.getUTCDate()]);
    } else if (explicitDueDay) {
      knownDueDaysByAccountKey.set(accountKey, [...(knownDueDaysByAccountKey.get(accountKey) ?? []), explicitDueDay]);
    }
    if (checkpoint.statementEndDate && explicitDueDate) {
      const lagDays = Math.round((toUtcMidday(explicitDueDate).getTime() - toUtcMidday(checkpoint.statementEndDate).getTime()) / DAY_IN_MS);
      if (lagDays > 0 && lagDays <= 45) {
        knownLagDaysByAccountKey.set(accountKey, [...(knownLagDaysByAccountKey.get(accountKey) ?? []), lagDays]);
      }
    }
  }

  for (const checkpoint of checkpoints) {
    const sourceMetadata = extractSourceMetadata(checkpoint);
    const institution = typeof sourceMetadata?.institution === "string" ? sourceMetadata.institution : checkpoint.account?.institution ?? null;
    if (!inferCreditCardCheckpoint(checkpoint, sourceMetadata)) {
      continue;
    }
    const referenceTimestamp = checkpoint.statementEndDate?.getTime() ?? checkpoint.createdAt.getTime();
    if (referenceTimestamp < recencyCutoff) {
      continue;
    }

    const totalAmountDue =
      parseAmountValue(sourceMetadata?.totalAmountDue ?? null) ??
      parseAmountValue(sourceMetadata?.endingBalance ?? null) ??
      parseAmountValue(checkpoint.endingBalance?.toString() ?? null);
    if (totalAmountDue === null || totalAmountDue <= 0) {
      continue;
    }

    const accountName =
      typeof sourceMetadata?.accountName === "string" && sourceMetadata.accountName.trim()
        ? sourceMetadata.accountName.trim()
        : checkpoint.account?.name ?? checkpoint.importFile?.fileName ?? "Credit card";
    const accountKey = normalizeAccountKey(
      checkpoint.account?.name ?? (typeof sourceMetadata?.accountName === "string" ? sourceMetadata.accountName : accountName),
      institution
    );
    const explicitPaymentDueDate = readExplicitPaymentDueDate(sourceMetadata, checkpoint);
    const rawPaymentDueDate =
      explicitPaymentDueDate ??
      inferDueDateFromHistory(
        checkpoint.statementEndDate,
        knownDueDaysByAccountKey.get(accountKey) ?? [],
        knownLagDaysByAccountKey.get(accountKey) ?? []
      );
    if (!rawPaymentDueDate) {
      continue;
    }
    const paymentDueDate = rollDateForwardMonthly(rawPaymentDueDate, now - DAY_IN_MS);
    const detectionSource =
      rawPaymentDueDate.getTime() <= now - DAY_IN_MS
        ? "projected"
        : explicitPaymentDueDate
          ? "explicit"
          : "inferred_history";
    const existing = remindersByAccountKey.get(accountKey);

    if (existing) {
      if (new Date(existing.paymentDueDate).getTime() <= paymentDueDate.getTime()) {
        continue;
      }
    }

    remindersByAccountKey.set(accountKey, {
      checkpointId: checkpoint.id,
      accountId: checkpoint.accountId,
      accountName,
      institution,
      currency:
        typeof sourceMetadata?.currency === "string" && sourceMetadata.currency.trim()
          ? sourceMetadata.currency.trim().toUpperCase()
          : checkpoint.account?.currency ?? null,
      statementStartDate: checkpoint.statementStartDate?.toISOString() ?? null,
      statementEndDate: checkpoint.statementEndDate?.toISOString() ?? null,
      paymentDueDate: paymentDueDate.toISOString(),
      totalAmountDue,
      sourceFileName: checkpoint.importFile?.fileName ?? null,
      daysUntilDue: Math.ceil((paymentDueDate.getTime() - now) / DAY_IN_MS),
      dueDayOfMonth: paymentDueDate.getUTCDate(),
      detectionSource,
    });
  }

  const dedupedByFingerprint = new Map<string, StatementReminder>();
  for (const reminder of remindersByAccountKey.values()) {
    const fingerprint = buildReminderFingerprint(reminder);
    const existing = dedupedByFingerprint.get(fingerprint);
    if (!existing || scoreReminderSpecificity(reminder) > scoreReminderSpecificity(existing)) {
      dedupedByFingerprint.set(fingerprint, reminder);
    }
  }

  return Array.from(dedupedByFingerprint.values()).sort(
    (a, b) => new Date(a.paymentDueDate).getTime() - new Date(b.paymentDueDate).getTime() || b.totalAmountDue - a.totalAmountDue
  );
};
