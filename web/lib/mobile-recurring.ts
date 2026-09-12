import { prisma } from "./prisma";
import { serializeFinancialCommitment } from "./commitments";
import { buildRecurringCalendarOccurrences } from "./recurring-calendar";
import { recurringPaymentAmount } from "./recurring-tracking";
// Read the complete authorized Profile so the calendar never implies a partial
// paginated month is complete. Reuse the same finite-term schedule as the web.
export async function mobileRecurring(
  workspaceId: string,
  year: number,
  month: number,
) {
  const records = await prisma.financialCommitment.findMany({
    where: { workspaceId },
    include: {
      account: {
        select: { id: true, name: true, institution: true, type: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  const commitments = records.map(serializeFinancialCommitment);
  return {
    items: commitments.map((c) => ({
      id: c.id,
      title: c.title,
      kind: c.kind,
      amount: recurringPaymentAmount(c),
      currency: c.currency,
      date: c.plannedPaymentDate ?? c.nextDueDate ?? c.dueDate,
      status: c.status,
      recurrence: c.recurrence,
      accountName: c.account?.name ?? null,
      categoryName: c.categoryName,
      notes: c.notes,
    })),
    occurrences: buildRecurringCalendarOccurrences(
      commitments,
      year,
      month,
    ).map((o) => ({
      id: o.commitment.id,
      date: o.dateKey,
      title: o.commitment.title,
      kind: o.commitment.kind,
      amount: recurringPaymentAmount(o.commitment, o.dateKey),
      currency: o.commitment.currency,
    })),
  };
}
