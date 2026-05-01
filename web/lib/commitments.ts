import { type CommitmentKind, type CommitmentRecurrence, type CommitmentStatus } from "@prisma/client";

export type FinancialCommitmentAccount = {
  id: string;
  name: string;
  institution: string | null;
  type: string;
};

export type FinancialCommitmentTransaction = {
  id: string;
  date: string;
  amount: string | null;
  merchantRaw: string;
  merchantClean: string | null;
  account: {
    name: string;
  };
};

export type FinancialCommitmentSummary = {
  id: string;
  workspaceId: string;
  kind: CommitmentKind;
  title: string;
  counterparty: string | null;
  amount: string | null;
  currency: string;
  dueDate: string | null;
  recurrence: CommitmentRecurrence;
  nextDueDate: string | null;
  notes: string | null;
  accountId: string | null;
  transactionId: string | null;
  statementCheckpointId: string | null;
  status: CommitmentStatus;
  source: string;
  confidence: number;
  createdAt: string;
  updatedAt: string;
  account: FinancialCommitmentAccount | null;
  transaction: FinancialCommitmentTransaction | null;
};

export const commitmentKindLabels: Record<CommitmentKind, string> = {
  planned_payment: "Planned payment",
  debt: "Debt",
  receivable: "Receivable",
  reminder: "Reminder",
};

export const commitmentKindHelp: Record<CommitmentKind, string> = {
  planned_payment: "Future bill, subscription, or transfer you want to remember.",
  debt: "Money you owe and want to keep visible.",
  receivable: "Money someone owes you and you want to track.",
  reminder: "Date-based reminder without a balance.",
};

export const commitmentRecurrenceLabels: Record<CommitmentRecurrence, string> = {
  once: "One-time",
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Yearly",
};

export const commitmentStatusLabels: Record<CommitmentStatus, string> = {
  active: "Active",
  paused: "Paused",
  resolved: "Resolved",
};

export const commitmentKindOptions = Object.entries(commitmentKindLabels).map(([value, label]) => ({
  value: value as CommitmentKind,
  label,
  help: commitmentKindHelp[value as CommitmentKind],
}));

export const commitmentRecurrenceOptions = Object.entries(commitmentRecurrenceLabels).map(([value, label]) => ({
  value: value as CommitmentRecurrence,
  label,
}));

export const commitmentStatusOptions = Object.entries(commitmentStatusLabels).map(([value, label]) => ({
  value: value as CommitmentStatus,
  label,
}));

const parseNullableText = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const parseNullableDate = (value: unknown) => {
  const text = parseNullableText(value);
  if (!text) {
    return null;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const parseAmount = (value: unknown) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const cleaned = String(value).replace(/[^0-9.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === "." || cleaned === "-.") {
    return null;
  }

  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : null;
};

export const serializeFinancialCommitment = <T extends {
  id: string;
  workspaceId: string;
  kind: CommitmentKind;
  title: string;
  counterparty: string | null;
  amount: { toString: () => string } | null;
  currency: string;
  dueDate: Date | null;
  recurrence: CommitmentRecurrence;
  nextDueDate: Date | null;
  notes: string | null;
  accountId: string | null;
  transactionId: string | null;
  statementCheckpointId: string | null;
  status: CommitmentStatus;
  source: string;
  confidence: number;
  createdAt: Date;
  updatedAt: Date;
  account?: FinancialCommitmentAccount | null;
  transaction?: FinancialCommitmentTransaction | null;
}>(commitment: T): FinancialCommitmentSummary => ({
  id: commitment.id,
  workspaceId: commitment.workspaceId,
  kind: commitment.kind,
  title: commitment.title,
  counterparty: commitment.counterparty,
  amount: commitment.amount?.toString() ?? null,
  currency: commitment.currency,
  dueDate: commitment.dueDate?.toISOString() ?? null,
  recurrence: commitment.recurrence,
  nextDueDate: commitment.nextDueDate?.toISOString() ?? null,
  notes: commitment.notes,
  accountId: commitment.accountId,
  transactionId: commitment.transactionId,
  statementCheckpointId: commitment.statementCheckpointId,
  status: commitment.status,
  source: commitment.source,
  confidence: commitment.confidence,
  createdAt: commitment.createdAt.toISOString(),
  updatedAt: commitment.updatedAt.toISOString(),
  account: commitment.account ?? null,
  transaction: commitment.transaction
    ? {
        id: commitment.transaction.id,
        date: commitment.transaction.date.toISOString(),
        amount: commitment.transaction.amount?.toString() ?? null,
        merchantRaw: commitment.transaction.merchantRaw,
        merchantClean: commitment.transaction.merchantClean,
        account: {
          name: commitment.transaction.account.name,
        },
      }
    : null,
});

export const parseCommitmentPayload = (payload: Record<string, unknown>) => {
  const kind = payload.kind;
  const recurrence = payload.recurrence;
  const status = payload.status;
  const title = parseNullableText(payload.title);
  const currency = parseNullableText(payload.currency)?.toUpperCase() ?? "PHP";
  const amount = parseAmount(payload.amount);

  return {
    workspaceId: parseNullableText(payload.workspaceId),
    kind: typeof kind === "string" && kind in commitmentKindLabels ? (kind as CommitmentKind) : null,
    title,
    counterparty: parseNullableText(payload.counterparty),
    amount,
    currency,
    dueDate: parseNullableDate(payload.dueDate),
    recurrence: typeof recurrence === "string" && recurrence in commitmentRecurrenceLabels ? (recurrence as CommitmentRecurrence) : "once",
    nextDueDate: parseNullableDate(payload.nextDueDate),
    notes: parseNullableText(payload.notes),
    accountId: parseNullableText(payload.accountId),
    transactionId: parseNullableText(payload.transactionId),
    statementCheckpointId: parseNullableText(payload.statementCheckpointId),
    status: typeof status === "string" && status in commitmentStatusLabels ? (status as CommitmentStatus) : "active",
  };
};
