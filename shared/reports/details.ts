import type { ReportPeriod, ReportRow, ReportView } from "./analysis";
import type { BudgetReportRow, MerchantReportRow, ReportCoverage } from "./workspace";

// Match complete bank activity labels so merchants with words like “Cash” or “Tax” in their names survive.
function isMerchantLabel(name: string) {
  const label = name.normalize("NFKC").toLowerCase().replace(/[-–—_./]+/g, " ").replace(/\s+/g, " ").trim();
  if (!label || /^(unknown( merchant)?|other|imported transaction|transaction)$/.test(label)) return false;
  if (/^(withholding tax|tax withheld|withheld tax|interest earned|interest paid|bank fee|service charge|atm withdrawal|credit card payment)$/.test(label)) return false;
  return !/^(?:(?:insta ?pay|pesonet)(?: (?:cash (?:in|out)|(?:funds? |bank )?transfer|payment))?|(?:funds? |bank |interbank )?transfer|cash (?:in|out))(?: (?:service |transfer )?(?:fee|charge))?$/.test(label);
}

export function reportMerchants(
  rows: ReportRow[],
  period: ReportPeriod,
): MerchantReportRow[] {
  const groups = new Map<string, MerchantReportRow>();
  const logos = new Map<string, Set<string>>();
  for (const r of rows) {
    if (r.type !== "expense" || !isMerchantLabel(r.merchant)) continue;
    const current = r.date >= period.from && r.date <= period.to;
    const previous =
      r.date >= period.previousFrom && r.date <= period.previousTo;
    if (!current && !previous) continue;
    if (r.merchantLogoUrl) {
      const paths = logos.get(r.merchant) ?? new Set<string>(); paths.add(r.merchantLogoUrl); logos.set(r.merchant, paths);
    }
    const v = groups.get(r.merchant) ?? {
      name: r.merchant,
      categoryName: r.category,
      amount: 0,
      previous: 0,
      count: 0,
      change: 0,
    };
    if (current) {
      v.amount += r.amount;
      v.count++;
    }
    if (previous) v.previous += r.amount;
    groups.set(r.merchant, v);
  }
  return [...groups.values()]
    .map((v) => ({
      ...v,
      merchantLogoUrl: logos.get(v.name)?.size === 1 ? [...logos.get(v.name)!][0] : null,
      amount: Math.round(v.amount * 100) / 100,
      previous: Math.round(v.previous * 100) / 100,
      change: Math.round((v.amount - v.previous) * 100) / 100,
    }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
}
export function reportCoverage(
  rows: ReportRow[],
  period: ReportPeriod,
  view: ReportView,
  missingBalanceAccounts: string[],
  datedHistoryAvailable: boolean,
): ReportCoverage {
  const current = rows.filter(
    (r) =>
      r.date >= period.from && r.date <= period.to && r.type !== "transfer",
  );
  const dates = current.map((r) => r.date).sort();
  const reviewCount = current.filter((r) => r.needsReview).length;
  const uncategorizedCount = current.filter((r) =>
    /^(other|uncategorized)$/i.test(r.category),
  ).length;
  const notes = [
    "Income and spending use saved, non-excluded transactions. Transfers are not counted as income or spending.",
    "Money over time is estimated from known balances and recorded movements. Net worth uses dated balance records.",
  ];
  if (missingBalanceAccounts.length)
    notes.push(
      `${missingBalanceAccounts.length} selected account(s) have no recorded balance and are omitted from the estimated balance total.`,
    );
  if (!datedHistoryAvailable)
    notes.push(
      "There is not enough complete dated balance history to draw net worth for this period.",
    );
  if (reviewCount)
    notes.push(
      `${reviewCount} transaction(s) still need review; their amounts are included in this view.`,
    );
  if (uncategorizedCount)
    notes.push(
      `${uncategorizedCount} transaction(s) use Other or Uncategorized.`,
    );
  if (dates.length)
    notes.push(
      `Saved activity shown runs from ${dates[0]} to ${dates.at(-1)}. This does not prove every statement or transaction has been imported.`,
    );
  else
    notes.push(
      "No saved income or expense transactions match this period and these filters.",
    );
  if (
    view.categories.length ||
    view.merchants?.length ||
    view.tags?.length ||
    view.review !== "all"
  )
    notes.push(
      "Transaction filters narrow income, spending and budget actuals. Balance charts still use all movements for the selected accounts.",
    );
  return {
    transactionCount: current.length,
    reviewCount,
    uncategorizedCount,
    firstTransaction: dates[0] ?? null,
    lastTransaction: dates.at(-1) ?? null,
    missingBalanceAccounts,
    datedHistoryAvailable,
    notes,
  };
}

/** Presentation only: do not invent a percentage against a zero baseline. */
export function merchantSpendingChange(row: Pick<MerchantReportRow, "amount" | "previous" | "change">): string {
  if (row.previous <= 0) return row.amount > 0 ? "New" : "—";
  const percent = Math.round(row.change / row.previous * 100);
  return `${percent > 0 ? "+" : ""}${percent}%`;
}

/** Rows are already scoped to one report currency and prorated at revision boundaries. */
export function budgetTimelines(rows: BudgetReportRow[]) {
  type Month = { label: string; target: number; actual: number; rows: BudgetReportRow[] };
  const budgets = new Map<string, Map<string, Month>>();
  for (const row of rows) {
    const months = budgets.get(row.id) ?? new Map<string, Month>();
    budgets.set(row.id, months);
    const month = months.get(row.month) ?? {
      label: new Date(row.month + "-01T12:00:00Z").toLocaleDateString("en", { month:"short", year:"numeric", timeZone:"UTC" }),
      target:0, actual:0, rows:[],
    };
    month.target += row.target;
    month.actual += row.actual;
    month.rows.push(row);
    months.set(row.month, month);
  }
  return Array.from(budgets, ([id, byMonth]) => {
    const months = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([,month]) => month);
    for (const month of months) month.rows.sort((a,b) => a.from.localeCompare(b.from));
    const latest = months[months.length - 1].rows.at(-1)!;
    const scale = Math.max(1, ...months.map(m => Math.max(m.target, m.actual)));
    return { id, latest, months, scale };
  });
}
