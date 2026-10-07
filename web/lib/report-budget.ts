import {
  getBudgetPeriodStart,
  getPeriodEnd,
  matchesBudgetScope,
  type BudgetRecord,
} from "./budgeting";
import {
  reportDay,
  shiftDay,
  type ReportPeriod,
  type ReportRow,
  type ReportView,
} from "../../shared/reports/analysis";
import type { BudgetReportRow } from "../../shared/reports/workspace";

// Calendar-only local dates let the existing budget cadence rules work in every server timezone.
const calendarDate = (day: string) => new Date(`${day}T12:00:00`);
const key = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const days = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
const round = (n: number) => Math.round(n * 100) / 100;

/** No grand total: category, account and global budgets can cover the same transaction. */
export function buildReportBudgets(
  budgets: (BudgetRecord & { createdAt: Date })[],
  rows: ReportRow[],
  period: ReportPeriod,
  view: ReportView,
  currency: string,
  timeZone: string,
): BudgetReportRow[] {
  const output: BudgetReportRow[] = [];
  for (const budget of budgets) {
    if (
      !budget.isActive ||
      budget.kind !== "spend_limit" ||
      budget.currency !== currency
    )
      continue;
    if (
      view.accounts.length &&
      budget.scope === "account" &&
      !view.accounts.includes(budget.accountId ?? "")
    )
      continue;
    if (
      view.categories.length &&
      budget.scope === "category" &&
      !view.categories.includes(budget.category?.name ?? "")
    )
      continue;
    const created = reportDay(budget.createdAt, timeZone);
    const eligible = rows
      .filter((r) => r.currency === currency)
      .map((r) => ({
        id: r.id,
        date: calendarDate(r.date),
        amount: r.amount,
        currency: r.currency,
        type: r.type,
        isTransfer: r.type === "transfer",
        categoryId: r.categoryId ?? null,
        accountId: r.accountId,
        category: { name: r.category },
        isExcluded: false,
      }))
      .filter((t) => matchesBudgetScope(budget, t));
    for (let month = period.from.slice(0, 7); month <= period.to.slice(0, 7);) {
      const start = calendarDate(month + "-01"),
        nextMonth = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      const from = [month + "-01", period.from, created].sort().at(-1)!;
      const to = [shiftDay(key(nextMonth), -1), period.to].sort()[0];
      if (from <= to) {
        let target = 0,
          cursor = from;
        // Prorate each intersecting cadence period; never assume all months have 30 days.
        while (cursor <= to) {
          const cadenceStart = getBudgetPeriodStart(
            budget.cadence,
            calendarDate(cursor),
          );
          const cadenceEnd = getPeriodEnd(budget.cadence, cadenceStart);
          const end = [key(cadenceEnd), shiftDay(to, 1)].sort()[0];
          target +=
            (Number(budget.targetAmount) * days(cursor, end)) /
            days(key(cadenceStart), key(cadenceEnd));
          cursor = end;
        }
        target = round(target);
        const actual = round(
          eligible
            .filter(
              (t) =>
                t.type === "expense" &&
                key(t.date) >= from &&
                key(t.date) <= to,
            )
            .reduce((sum, t) => sum + Number(t.amount), 0),
        );
        output.push({
          id: budget.id,
          name: budget.name,
          categoryId: budget.categoryId,
          categoryName: budget.category?.name ?? null,
          accountId: budget.accountId,
          scope: budget.scope,
          cadence: budget.cadence,
          month,
          from,
          to,
          target,
          actual,
          remaining: Math.max(0, round(target - actual)),
          over: Math.max(0, round(actual - target)),
          partial:
            from !== month + "-01" || to !== shiftDay(key(nextMonth), -1),
        });
      }
      month = key(nextMonth).slice(0, 7);
    }
  }
  return output.sort(
    (a, b) => a.month.localeCompare(b.month) || a.name.localeCompare(b.name),
  );
}
