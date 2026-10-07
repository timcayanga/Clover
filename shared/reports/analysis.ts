/** Read-only, platform-neutral report arithmetic. Dates are calendar days in the user's timezone. */
export type ReportRow = {
  id: string;
  date: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  currency: string;
  category: string;
  categoryId?: string;
  merchant: string;
  accountId: string;
  account: string;
  reviewStatus?: string;
  needsReview?: boolean;
};
export type ReportView = {
  section: "overview" | "spending" | "trends" | "advanced";
  range: "7d" | "30d" | "90d" | "ytd" | "12m" | "all" | "custom";
  from: string;
  to: string;
  currency: string;
  accounts: string[];
  categories: string[];
  review: "all" | "confirmed" | "pending";
  transfers: "exclude" | "include" | "only";
  compare: "previous" | "year";
  chart: "Donut" | "Bars" | "Table";
  trendCategories: string[];
};
export const defaultReportView: ReportView = {
  section: "overview",
  range: "30d",
  from: "",
  to: "",
  currency: "",
  accounts: [],
  categories: [],
  review: "all",
  transfers: "exclude",
  compare: "previous",
  chart: "Donut",
  trendCategories: [],
};
export const reportRanges = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "ytd", label: "Year to date" },
  { value: "12m", label: "Last 12 months" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom dates" },
] as const;
export function validReportDate(s: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    Number.isFinite(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s
  );
}
export function shiftDay(s: string, days: number) {
  return new Date(Date.parse(s) + days * 86400000).toISOString().slice(0, 10);
}
const calendarFormatters = new Map<string, Intl.DateTimeFormat>();
export function reportDay(date: Date, timeZone: string) {
  let formatter = calendarFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    if (calendarFormatters.size >= 32)
      calendarFormatters.delete(calendarFormatters.keys().next().value!);
    calendarFormatters.set(timeZone, formatter);
  }
  return formatter.format(date);
}
function previousYear(s: string) {
  const d = new Date(s);
  const m = d.getUTCMonth();
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  if (d.getUTCMonth() !== m) d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}
export function reportPeriod(
  view: ReportView,
  today: string,
  earliest: string = today,
) {
  let to = today,
    from = shiftDay(today, -29);
  if (view.range === "custom") {
    from = view.from;
    to = view.to;
  } else if (view.range === "7d") from = shiftDay(today, -6);
  else if (view.range === "90d") from = shiftDay(today, -89);
  else if (view.range === "ytd") from = today.slice(0, 4) + "-01-01";
  else if (view.range === "12m") from = shiftDay(previousYear(today), 1);
  else if (view.range === "all") from = earliest;
  if (
    !validReportDate(from) ||
    !validReportDate(to) ||
    from > to ||
    to > today ||
    Number(to.slice(0, 4)) - Number(from.slice(0, 4)) > 100
  )
    throw new Error("Choose valid dates up to today (within 100 years).");
  const count = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  return {
    from,
    to,
    previousFrom:
      view.compare === "year" ? previousYear(from) : shiftDay(from, -count),
    previousTo: view.compare === "year" ? previousYear(to) : shiftDay(from, -1),
    comparison: view.compare,
  };
}
export type ReportPeriod = ReturnType<typeof reportPeriod>;
export const savingsRate = (income: number, expense: number) =>
  income > 0 ? ((income - expense) / income) * 100 : null;
const sum = (xs: number[]) =>
  Math.round(xs.reduce((a, b) => a + b, 0) * 1e8) / 1e8;
const totals = (rows: ReportRow[]) => ({
  income: sum(rows.filter((r) => r.type === "income").map((r) => r.amount)),
  expense: sum(rows.filter((r) => r.type === "expense").map((r) => r.amount)),
});
export function selectedReportRows(rows: ReportRow[], view: ReportView) {
  return rows.filter(
    (r) =>
      (!view.accounts.length || view.accounts.includes(r.accountId)) &&
      (!view.categories.length || view.categories.includes(r.category)) &&
      (view.review === "all" ||
        (view.review === "confirmed"
          ? ["confirmed", "edited"].includes(r.reviewStatus ?? "")
          : r.needsReview ?? !["confirmed", "edited", "rejected", "duplicate_skipped"].includes(
              r.reviewStatus ?? "",
            ))) &&
      (view.transfers !== "only" || r.type === "transfer"),
  );
}
export function analyzeReport(rows: ReportRow[], period: ReportPeriod) {
  const usable = rows.filter(
    (r) => r.type !== "transfer" && Number.isFinite(r.amount),
  );
  const between = (a: string, b: string) =>
    usable.filter((r) => r.date >= a && r.date <= b);
  const currentRows = between(period.from, period.to),
    previousRows = between(period.previousFrom, period.previousTo);
  const current = totals(currentRows),
    previous = totals(previousRows);
  const months: string[] = [];
  for (let m = period.from.slice(0, 7); m <= period.to.slice(0, 7); ) {
    months.push(m);
    const [y, n] = m.split("-").map(Number);
    m = `${n === 12 ? y + 1 : y}-${String(n === 12 ? 1 : n + 1).padStart(2, "0")}`;
  }
  const group = (items: ReportRow[], key: (r: ReportRow) => string) => {
    const map = new Map<string, ReportRow[]>();
    for (const r of items) {
      const k = key(r);
      const bucket = map.get(k);
      if (bucket) bucket.push(r);
      else map.set(k, [r]);
    }
    return [...map]
      .map(([name, rs]) => ({
        name,
        amount: sum(rs.map((r) => r.amount)),
        count: rs.length,
        categoryId: rs[0]?.categoryId,
        dates: [...new Set(rs.map((r) => r.date))].sort(),
      }))
      .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
  };
  const monthlyAmounts = new Map<string, number>();
  for (const r of currentRows) {
    const key = JSON.stringify([r.type, r.category, r.date.slice(0, 7)]);
    monthlyAmounts.set(key, (monthlyAmounts.get(key) ?? 0) + r.amount);
  }
  const expenses = currentRows.filter((r) => r.type === "expense");
  const categories = group(expenses, (r) => r.category),
    incomeSources = group(
      currentRows.filter((r) => r.type === "income"),
      (r) => r.merchant,
    );
  const merchants = group(expenses, (r) => r.merchant);
  const monthly = months.map((month) => ({
    month,
    ...totals(currentRows.filter((r) => r.date.startsWith(month))),
    partial:
      period.from > `${month}-01` ||
      period.to <
        shiftDay(
          `${Number(month.slice(0, 4)) + (month.endsWith("-12") ? 1 : 0)}-${String((Number(month.slice(5)) % 12) + 1).padStart(2, "0")}-01`,
          -1,
        ),
  }));
  const statement = (["income", "expense"] as const).flatMap((type) =>
    group(
      currentRows.filter((r) => r.type === type),
      (r) => r.category,
    ).map((g) => ({
      name: g.name,
      categoryId: g.categoryId,
      type,
      values: months.map(
        (m) => monthlyAmounts.get(JSON.stringify([type, g.name, m])) ?? 0,
      ),
      total: g.amount,
      average: g.amount / months.length,
    })),
  );
  const previousCategories = group(
    previousRows.filter((r) => r.type === "expense"),
    (r) => r.category,
  );
  const trendGroups = [
    ...categories,
    ...previousCategories
      .filter((p) => !categories.some((c) => c.name === p.name))
      .map((p) => ({ ...p, amount: 0, count: 0, dates: [] as string[] })),
  ];
  const trends = trendGroups.map((g) => {
    const prior =
      previousCategories.find((p) => p.name === g.name)?.amount ?? 0;
    return {
      ...g,
      previous: prior,
      delta: g.amount - prior,
      change: prior ? ((g.amount - prior) / prior) * 100 : null,
      average: g.amount / months.length,
      points: months.map((m) => ({
        date: m + "-01",
        value: monthlyAmounts.get(JSON.stringify(["expense", g.name, m])) ?? 0,
      })),
    };
  });
  const dayMap = new Map<string, ReturnType<typeof totals>>();
  for (const r of currentRows) {
    const d = dayMap.get(r.date) ?? { income: 0, expense: 0 };
    if (r.type !== "transfer") d[r.type] += r.amount;
    dayMap.set(r.date, d);
  }
  const priorMap = new Map<string, number>();
  for (const r of previousRows)
    if (r.type === "expense")
      priorMap.set(r.date, (priorMap.get(r.date) ?? 0) + r.amount);
  let cumulative = 0,
    priorCumulative = 0;
  const days = [],
    pace = [];
  for (let d = period.from, i = 0; d <= period.to; d = shiftDay(d, 1), i++) {
    const v = dayMap.get(d) ?? { income: 0, expense: 0 };
    days.push({ date: d, ...v });
    cumulative += v.expense;
    const p = shiftDay(period.previousFrom, i);
    priorCumulative += p <= period.previousTo ? (priorMap.get(p) ?? 0) : 0;
    pace.push({ date: d, current: cumulative, previous: priorCumulative });
  }
  const intervalPoints = (from: string, to: string) => {
    const grouped = new Map<string, { income: number; expense: number }>();
    for (const row of between(from, to)) {
      const d = grouped.get(row.date) ?? { income: 0, expense: 0 };
      if (row.type !== "transfer") d[row.type] += row.amount;
      grouped.set(row.date, d);
    }
    const points = [];
    for (let date = from; date <= to; date = shiftDay(date, 1))
      points.push({
        date,
        ...(grouped.get(date) ?? { income: 0, expense: 0 }),
      });
    return points;
  };
  const interval = (from: string, to: string) => {
    const n = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
    const pFrom = shiftDay(from, -n),
      pTo = shiftDay(from, -1);
    return {
      from,
      to,
      points: intervalPoints(from, to),
      current: totals(between(from, to)),
      previous: totals(between(pFrom, pTo)),
    };
  };
  const weekly = interval(shiftDay(period.to, -6), period.to),
    monthFrom = period.to.slice(0, 7) + "-01";
  const previousMonthEnd = shiftDay(monthFrom, -1),
    elapsed = Math.round(
      (Date.parse(period.to) - Date.parse(monthFrom)) / 86400000,
    );
  const previousMonthFrom = previousMonthEnd.slice(0, 7) + "-01";
  const monthlySummary = {
    from: monthFrom,
    to: period.to,
    points: intervalPoints(monthFrom, period.to),
    current: totals(between(monthFrom, period.to)),
    previous: totals(
      between(
        previousMonthFrom,
        [shiftDay(previousMonthFrom, elapsed), previousMonthEnd].sort()[0],
      ),
    ),
  };
  const repeats = merchants
    .filter((m) => m.dates.length >= 2)
    .map((m) => {
      const gaps = m.dates
        .slice(1)
        .map((d, i) => (Date.parse(d) - Date.parse(m.dates[i])) / 86400000)
        .sort((a, b) => a - b);
      const gap = gaps[Math.floor(gaps.length / 2)];
      const cadence =
        gap >= 25 && gap <= 35
          ? "Monthly"
          : gap >= 6 && gap <= 8
            ? "Weekly"
            : gap >= 12 && gap <= 16
              ? "Every two weeks"
              : "Repeated";
      return {
        ...m,
        cadence,
        nextDue:
          cadence === "Repeated"
            ? null
            : shiftDay(m.dates.at(-1)!, Math.round(gap)),
      };
    });
  const accounts = [...new Set(currentRows.map((r) => r.accountId))].map(
    (id) => {
      const rs = currentRows.filter((r) => r.accountId === id);
      return {
        id,
        account: rs[0].account,
        ...totals(rs),
        destinations: group(
          rs.filter((r) => r.type === "expense"),
          (r) => r.category,
        ),
      };
    },
  );
  const priorMerchants = group(
    previousRows.filter((r) => r.type === "expense"),
    (r) => r.merchant,
  );
  const unusual = merchants
    .map((m) => ({
      ...m,
      delta:
        m.amount - (priorMerchants.find((p) => p.name === m.name)?.amount ?? 0),
    }))
    .sort((a, b) => b.delta - a.delta)
    .find((m) => m.delta > 0);
  return {
    ...period,
    transferActivity: {
      count: rows.filter(
        (r) =>
          r.type === "transfer" && r.date >= period.from && r.date <= period.to,
      ).length,
    },
    current,
    previous,
    days,
    pace,
    months,
    monthly,
    statement,
    trends,
    categories,
    incomeSources,
    merchants: merchants.slice(0, 10),
    repeats: repeats.slice(0, 10),
    accounts,
    weekly,
    monthlySummary,
    drivers: {
      category: trends.length
        ? trends.slice().sort((a, b) => b.delta - a.delta)[0]
        : null,
      merchant: unusual ?? null,
      recurringTotal: sum(repeats.map((m) => m.amount)),
    },
    reviewCount: currentRows.filter(
      (r) => r.needsReview ?? !["confirmed", "edited"].includes(r.reviewStatus ?? ""),
    ).length,
  };
}
export type ReportAnalysis = ReturnType<typeof analyzeReport>;
