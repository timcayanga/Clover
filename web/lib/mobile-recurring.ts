import { recurringBankBrand } from "./recurring-bank-brand";
import { transactionMerchantLogo } from "./transaction-merchant-logo";
import { recurringDashboardSummary, type RecurringSummaryTab } from "./recurring-dashboard-summary";
import { getPlannedPaymentSuggestions } from "./planned-payment-suggestions";
import { prisma } from "./prisma";
import { serializeFinancialCommitment } from "./commitments";
import { buildRecurringCalendarOccurrences } from "./recurring-calendar";
import {
  recurringPaymentAmount,
  recurringCompletionDate,
} from "./recurring-tracking";
// Read the complete authorized Profile so the calendar never implies a partial
// paginated month is complete. Reuse the same finite-term schedule as the web.
export async function mobileRecurring(
  workspaceId: string,
  year: number,
  month: number,
  calendarYear = false,
) {
  const records = await prisma.financialCommitment.findMany({
    where: { workspaceId },
    include: {
      occurrences: { select: { dueDate: true, completedAt: true } },
      account: {
        select: { id: true, name: true, institution: true, type: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  const commitments = records.map(serializeFinancialCommitment);
  const suggestions = await getPlannedPaymentSuggestions(workspaceId);
  const completions = new Map(records.map(record => [record.id, new Set(record.occurrences.map(o => o.dueDate.toISOString().slice(0, 10)))]));
  return {
    summaries: Object.fromEntries((["overview", "planned", "debt", "owed", "installments"] as RecurringSummaryTab[]).map(tab => [tab, recurringDashboardSummary(commitments, tab, suggestions.length)])),
    suggestions: suggestions.map((s) => ({
      id: s.id,
      title: s.title,
      amount: s.amount,
      currency: s.currency,
      dueDate: s.dueDate,
      recurrence: s.recurrence,
      accountId: s.accountId,
      accountName: s.accountName,
      categoryName: s.categoryName,
      notes: s.notes,
      confidence: s.confidence,
      reason: s.reasonSummary,
      evidenceTransactionIds: s.transactionIds,
      statementCheckpointId: s.statementCheckpointId,
    })),
    items: commitments.map((c) => {
      const bank = recurringBankBrand(c.title);
      const logo = bank ? {merchantLogoUrl:bank.logoSrc, merchantLogoNameKey:JSON.stringify([c.title,c.title])}
        : transactionMerchantLogo({ merchantRaw:c.title, merchantClean:c.title, categoryName:c.categoryName, currency:c.currency });
      return {
        ...logo,
        principalAmount: c.amount,
        accountId: c.accountId,
        dueDate: c.dueDate,
        plannedPaymentDate: c.plannedPaymentDate,
        nextDueDate: c.nextDueDate,
        counterparty: c.counterparty,
        tracking: c.tracking,
        completedDates:
          records
            .find((r) => r.id === c.id)
            ?.occurrences.map((o) => o.dueDate.toISOString().slice(0, 10)) ?? [],
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
      };
    }),
    occurrences: (calendarYear
      ? Array.from({ length: 14 }, (_, index) => {
          const date = new Date(year, index - 1, 1);
          return buildRecurringCalendarOccurrences(commitments, date.getFullYear(), date.getMonth());
        }).flat()
      : buildRecurringCalendarOccurrences(commitments, year, month)
    ).map((o) => ({
      id: o.commitment.id,
      date: o.dateKey,
      dueDate: recurringCompletionDate(o.commitment, o.dateKey),
      completed: completions.get(o.commitment.id)?.has(recurringCompletionDate(o.commitment, o.dateKey)) ?? false,
      title: o.commitment.title,
      kind: o.commitment.kind,
      amount: recurringPaymentAmount(o.commitment, o.dateKey),
      currency: o.commitment.currency,
    })),
  };
}
