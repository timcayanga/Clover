import { prisma } from "@/lib/prisma";
import { hasCompatibleTable } from "@/lib/data-engine";

const CREDIT_CARD_REMINDER_INSTITUTIONS = new Set(["BPI", "AUB", "RCBC"]);
const DAY_IN_MS = 24 * 60 * 60 * 1000;

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
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const addMonths = (date: Date, months: number) => {
  const next = new Date(date);
  const day = next.getDate();
  next.setMonth(next.getMonth() + months, 1);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
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

const inferDueDateFromHistory = (statementEndDate: Date | null, knownDueDays: number[]) => {
  if (!statementEndDate || knownDueDays.length === 0) {
    return null;
  }

  const sortedDays = [...knownDueDays].sort((left, right) => left - right);
  const inferredDay = sortedDays[Math.floor((sortedDays.length - 1) / 2)] ?? sortedDays[0] ?? 1;
  const baseDate = new Date(statementEndDate);
  baseDate.setUTCDate(Math.min(inferredDay, 28));
  return baseDate.getTime() <= statementEndDate.getTime() ? addMonths(baseDate, 1) : baseDate;
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
  const remindersByAccountKey = new Map<string, StatementReminder>();
  const knownDueDaysByAccountKey = new Map<string, number[]>();

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
    if (!explicitDueDate) {
      continue;
    }
    knownDueDaysByAccountKey.set(accountKey, [...(knownDueDaysByAccountKey.get(accountKey) ?? []), explicitDueDate.getUTCDate()]);
  }

  for (const checkpoint of checkpoints) {
    const sourceMetadata = extractSourceMetadata(checkpoint);
    const institution = typeof sourceMetadata?.institution === "string" ? sourceMetadata.institution : checkpoint.account?.institution ?? null;
    if (!inferCreditCardCheckpoint(checkpoint, sourceMetadata)) {
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
    const paymentDueDate =
      readExplicitPaymentDueDate(sourceMetadata, checkpoint) ??
      inferDueDateFromHistory(checkpoint.statementEndDate, knownDueDaysByAccountKey.get(accountKey) ?? []);
    if (!paymentDueDate || paymentDueDate.getTime() <= now) {
      continue;
    }
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
    });
  }

  return Array.from(remindersByAccountKey.values()).sort(
    (a, b) => new Date(a.paymentDueDate).getTime() - new Date(b.paymentDueDate).getTime() || b.totalAmountDue - a.totalAmountDue
  );
};
