import type { CommitmentRecurrence } from "@prisma/client";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const toUtcDateOnly = (value: Date) =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));

const addMonthsClamped = (value: Date, monthCount: number, preferredDay = value.getUTCDate()) => {
  const year = value.getUTCFullYear();
  const month = value.getUTCMonth() + monthCount;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(preferredDay, lastDay)));
};

export const addCommitmentRecurrence = (
  value: Date,
  recurrence: CommitmentRecurrence,
  preferredDay = value.getUTCDate()
) => {
  const date = toUtcDateOnly(value);

  switch (recurrence) {
    case "weekly":
      date.setUTCDate(date.getUTCDate() + 7);
      return date;
    case "biweekly":
      date.setUTCDate(date.getUTCDate() + 14);
      return date;
    case "monthly":
      return addMonthsClamped(date, 1, preferredDay);
    case "quarterly":
      return addMonthsClamped(date, 3, preferredDay);
    case "annual":
      return addMonthsClamped(date, 12, preferredDay);
    default:
      return date;
  }
};

const recurrenceGraceDays: Record<CommitmentRecurrence, number> = {
  once: 30,
  weekly: 2,
  biweekly: 3,
  monthly: 7,
  quarterly: 14,
  annual: 30,
};

export const resolveRelevantCommitmentDueDate = (params: {
  dueDate: Date | null;
  nextDueDate: Date | null;
  recurrence: CommitmentRecurrence;
  now?: Date;
}) => {
  const sourceDate = params.nextDueDate ?? params.dueDate;
  if (!sourceDate || Number.isNaN(sourceDate.getTime())) {
    return null;
  }

  let occurrenceDate = toUtcDateOnly(sourceDate);
  if (params.recurrence === "once") {
    return occurrenceDate;
  }

  const today = toUtcDateOnly(params.now ?? new Date());
  const preferredDay = occurrenceDate.getUTCDate();
  const earliestVisibleDate = new Date(
    today.getTime() - recurrenceGraceDays[params.recurrence] * DAY_IN_MS
  );

  for (let guard = 0; guard < 600 && occurrenceDate < earliestVisibleDate; guard += 1) {
    const nextDate = addCommitmentRecurrence(occurrenceDate, params.recurrence, preferredDay);
    if (nextDate.getTime() <= occurrenceDate.getTime()) {
      break;
    }
    occurrenceDate = nextDate;
  }

  return occurrenceDate;
};

export const resolveTrackedCommitmentDueDate = (params: {
  dueDate: Date | null;
  nextDueDate: Date | null;
  recurrence: CommitmentRecurrence;
  now?: Date;
  activationWindowDays?: number;
}) => {
  const sourceDate = params.nextDueDate ?? params.dueDate;
  if (!sourceDate || Number.isNaN(sourceDate.getTime())) {
    return null;
  }

  let occurrenceDate = toUtcDateOnly(sourceDate);
  if (params.recurrence === "once") {
    return occurrenceDate;
  }

  const today = toUtcDateOnly(params.now ?? new Date());
  const activationDate = new Date(
    today.getTime() + Math.max(0, params.activationWindowDays ?? 7) * DAY_IN_MS
  );
  const preferredDay = occurrenceDate.getUTCDate();

  for (let guard = 0; guard < 600; guard += 1) {
    const nextDate = addCommitmentRecurrence(occurrenceDate, params.recurrence, preferredDay);
    if (nextDate.getTime() <= occurrenceDate.getTime() || nextDate > activationDate) {
      break;
    }
    occurrenceDate = nextDate;
  }

  return occurrenceDate;
};

export const toCommitmentOccurrenceKey = (value: Date) =>
  toUtcDateOnly(value).toISOString().slice(0, 10);

export const parseCommitmentOccurrenceDate = (value: unknown) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || toCommitmentOccurrenceKey(parsed) !== value ? null : parsed;
};
