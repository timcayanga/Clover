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
function buildBudgetSettings(
  budgets: (BudgetRecord & { createdAt: Date })[],
  rows: ReportRow[],
  period: ReportPeriod,
  view: ReportView,
  currency: string,
  timeZone: string,
  categoryNames: ReadonlyMap<string, string> = new Map(),
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
      !view.categories.includes(categoryNames.get(budget.categoryId ?? "") ?? budget.category?.name ?? "")
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
    for (
      let month = period.from.slice(0, 7);
      month <= period.to.slice(0, 7);
    ) {
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

export type ReportBudgetRevision = {
  budgetId: string;
  sequence: number;
  effectiveAt: Date;
  source: string;
  snapshot: unknown;
};
type HistoricalBudget = BudgetRecord & { createdAt: Date };
function readSnapshot(value: unknown): HistoricalBudget | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const s = value as Record<string, unknown>;
  if (
    typeof s.id !== "string" ||
    typeof s.name !== "string" ||
    typeof s.currency !== "string" ||
    !["spend_limit", "savings_target"].includes(String(s.kind)) ||
    !["global", "category", "account"].includes(String(s.scope)) ||
    !["daily", "weekly", "biweekly", "monthly", "quarterly", "annual"].includes(
      String(s.cadence),
    ) ||
    !Number.isFinite(Number(s.targetAmount)) ||
    !Number.isFinite(Date.parse(String(s.createdAt)))
  )
    return null;
  return {
    id: s.id,
    name: s.name,
    kind: s.kind as BudgetRecord["kind"],
    scope: s.scope as BudgetRecord["scope"],
    cadence: s.cadence as BudgetRecord["cadence"],
    targetAmount: Number(s.targetAmount),
    currency: s.currency,
    isActive: s.isActive === true,
    accountId: typeof s.accountId === "string" ? s.accountId : null,
    categoryId: typeof s.categoryId === "string" ? s.categoryId : null,
    category:
      typeof s.categoryName === "string" ? { name: s.categoryName } : null,
    createdAt: new Date(String(s.createdAt)),
  };
}
/** Last change on a Profile-local calendar day applies to that day. Earlier days never change. */
export function buildReportBudgets(
  budgets: HistoricalBudget[],
  rows: ReportRow[],
  period: ReportPeriod,
  view: ReportView,
  currency: string,
  timeZone: string,
  revisions: ReportBudgetRevision[] = [],
  categoryNames: ReadonlyMap<string, string> = new Map(),
): BudgetReportRow[] {
  const groups = new Map<string, ReportBudgetRevision[]>();
  for (const r of revisions)
    groups.set(r.budgetId, [...(groups.get(r.budgetId) ?? []), r]);
  const result: BudgetReportRow[] = [];
  for (const id of new Set([...budgets.map((b) => b.id), ...groups.keys()])) {
    const history = (groups.get(id) ?? []).sort(
      (a, b) => +a.effectiveAt - +b.effectiveAt || a.sequence - b.sequence,
    );
    if (!history.length) {
      const current = budgets.find((b) => b.id === id);
      if (current)
        result.push(
          ...buildBudgetSettings(
            [current],
            rows,
            period,
            view,
            currency,
            timeZone,
            categoryNames,
          ).map((r) => ({ ...r, historyBasis: "estimate" as const })),
        );
      continue;
    }
    const first = readSnapshot(history[0].snapshot);
    if (!first) continue;
    const knownFrom = reportDay(history[0].effectiveAt, timeZone);
    const starts = new Map<
      string,
      {
        budget: HistoricalBudget;
        basis: "recorded" | "estimate";
        sequence: number;
      }
    >();
    if (history[0].source === "baseline")
      starts.set(reportDay(first.createdAt, timeZone), {
        budget: first,
        basis: "estimate",
        sequence: 0,
      });
    for (const h of history) {
      const budget = readSnapshot(h.snapshot);
      if (budget)
        starts.set(reportDay(h.effectiveAt, timeZone), {
          budget,
          basis: "recorded",
          sequence: h.sequence,
        });
    }
    const segments = [...starts].sort(([a], [b]) => a.localeCompare(b));
    for (let i = 0; i < segments.length; i++) {
      const [start, segment] = segments[i];
      const from = [period.from, start].sort().at(-1)!;
      const to = [
        period.to,
        segments[i + 1] ? shiftDay(segments[i + 1][0], -1) : period.to,
      ].sort()[0];
      if (from > to) continue;
      result.push(
        ...buildBudgetSettings(
          [segment.budget],
          rows,
          { ...period, from, to },
          view,
          currency,
          timeZone,
          categoryNames,
        ).map((r) => ({
          ...r,
          historyBasis: segment.basis,
          historyKnownFrom: knownFrom,
          revision: segment.sequence,
        })),
      );
    }
  }
  return result.sort(
    (a, b) => a.from.localeCompare(b.from) || a.name.localeCompare(b.name),
  );
}
