import type { ReportPeriod, ReportRow, ReportView } from "./analysis";
import type { MerchantReportRow, ReportCoverage } from "./workspace";

export function reportMerchants(
  rows: ReportRow[],
  period: ReportPeriod,
): MerchantReportRow[] {
  const groups = new Map<string, MerchantReportRow>();
  for (const r of rows) {
    if (r.type !== "expense") continue;
    const current = r.date >= period.from && r.date <= period.to;
    const previous =
      r.date >= period.previousFrom && r.date <= period.previousTo;
    if (!current && !previous) continue;
    const v = groups.get(r.merchant) ?? {
      name: r.merchant,
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
