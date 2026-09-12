import type { FinancialCommitmentSummary } from "./commitments";
import { buildRecurringCalendarOccurrences } from "./recurring-calendar";
import {
  recurringCompletionDate,
  recurringPaymentAmount,
} from "./recurring-tracking";
// Calendar and Home use identical finite-term schedules and completion keys.
export function mobileHomePayments(
  commitments: FinancialCommitmentSummary[],
  completed: Map<string, Set<string>>,
  today: string,
) {
  const [year, month] = today.split("-").map(Number);
  const horizon = new Date(`${today}T00:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + 30);
  const through = horizon.toISOString().slice(0, 10);
  const occurrences = [-1, 0, 1, 2].flatMap((offset) => {
    const date = new Date(year, month - 1 + offset, 1);
    return buildRecurringCalendarOccurrences(
      commitments,
      date.getFullYear(),
      date.getMonth(),
    );
  });
  // Include old unresolved one-time payments even outside the preview months.
  for (const c of commitments) {
    const key = (c.plannedPaymentDate ?? c.dueDate ?? c.nextDueDate)?.slice(
      0,
      10,
    );
    if (
      c.status === "active" &&
      c.recurrence === "once" &&
      key &&
      key < today &&
      !occurrences.some((o) => o.commitment.id === c.id)
    )
      occurrences.push({
        commitment: c,
        dateKey: key,
        day: Number(key.slice(-2)),
      });
  }
  const rows = occurrences
    .filter(
      (o) =>
        !completed
          .get(o.commitment.id)
          ?.has(recurringCompletionDate(o.commitment, o.dateKey)),
    )
    .map((o) => ({
      id: `${o.commitment.id}:${o.dateKey}`,
      title: o.commitment.title,
      date: o.dateKey,
      amount:
        recurringPaymentAmount(o.commitment, o.dateKey)?.toString() ?? null,
    }));
  return {
    upcoming: rows
      .filter((o) => o.date >= today && o.date < through)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 5),
    overdue: rows
      .filter((o) => o.date < today)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5),
  };
}
