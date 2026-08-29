import type { FinancialCommitmentSummary } from "@/lib/commitments";

export type RecurringCalendarKind = FinancialCommitmentSummary["kind"];

export type RecurringCalendarOccurrence = {
  commitment: FinancialCommitmentSummary;
  dateKey: string;
  day: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const parseCommitmentDate = (value: string | null) => {
  if (!value) return null;
  const dateKey = value.slice(0, 10);
  const parsed = new Date(`${dateKey}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const toRecurringCalendarDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addOccurrence = (
  result: RecurringCalendarOccurrence[],
  commitment: FinancialCommitmentSummary,
  date: Date,
) => {
  result.push({
    commitment,
    dateKey: toRecurringCalendarDateKey(date),
    day: date.getDate(),
  });
};

export const buildRecurringCalendarOccurrences = (
  commitments: FinancialCommitmentSummary[],
  year: number,
  month: number,
) => {
  const monthStart = new Date(year, month, 1, 12);
  const monthEnd = new Date(year, month + 1, 0, 12);
  const result: RecurringCalendarOccurrence[] = [];

  for (const commitment of commitments) {
    if (commitment.status !== "active") continue;

    const anchor = parseCommitmentDate(commitment.dueDate ?? commitment.nextDueDate);
    if (!anchor || anchor.getTime() > monthEnd.getTime()) continue;

    if (commitment.recurrence === "once") {
      if (anchor.getFullYear() === year && anchor.getMonth() === month) {
        addOccurrence(result, commitment, anchor);
      }
      continue;
    }

    if (commitment.recurrence === "weekly" || commitment.recurrence === "biweekly") {
      const intervalDays = commitment.recurrence === "weekly" ? 7 : 14;
      const elapsedDays = Math.floor((monthStart.getTime() - anchor.getTime()) / DAY_MS);
      const stepsToMonth = Math.max(0, Math.ceil(elapsedDays / intervalDays));
      const occurrence = new Date(anchor);
      occurrence.setDate(anchor.getDate() + stepsToMonth * intervalDays);
      while (occurrence.getTime() <= monthEnd.getTime()) {
        if (occurrence.getTime() >= monthStart.getTime()) {
          addOccurrence(result, commitment, occurrence);
        }
        occurrence.setDate(occurrence.getDate() + intervalDays);
      }
      continue;
    }

    const anchorMonthIndex = anchor.getFullYear() * 12 + anchor.getMonth();
    const targetMonthIndex = year * 12 + month;
    const monthDifference = targetMonthIndex - anchorMonthIndex;
    const cadenceMonths = commitment.recurrence === "monthly" ? 1 : commitment.recurrence === "quarterly" ? 3 : 12;
    if (monthDifference < 0 || monthDifference % cadenceMonths !== 0) continue;

    const occurrenceDay = Math.min(anchor.getDate(), monthEnd.getDate());
    addOccurrence(result, commitment, new Date(year, month, occurrenceDay, 12));
  }

  return result.sort((left, right) =>
    left.day - right.day || left.commitment.title.localeCompare(right.commitment.title)
  );
};

export const getRecurringCalendarYearOptions = (
  commitments: FinancialCommitmentSummary[],
  currentYear: number,
) => {
  const years = commitments.flatMap((commitment) => {
    const date = parseCommitmentDate(commitment.dueDate ?? commitment.nextDueDate);
    return date ? [date.getFullYear()] : [];
  });
  const minimum = Math.min(currentYear - 3, ...years);
  const maximum = Math.max(currentYear + 5, ...years);
  return Array.from({ length: maximum - minimum + 1 }, (_, index) => minimum + index);
};
