import { z } from "zod";
import { prisma } from "./prisma";
import { buildActiveWorkspaceTransactionWhere } from "./transaction-query";
import { resolveFinancialTransactionType } from "./transaction-directions";
const day = 86400000;
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      Number.isFinite(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
  );
export function nativeReportWindow(params: URLSearchParams, now = new Date()) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const to = date.parse(params.get("to") ?? today);
  const end = new Date(`${to}T23:59:59.999+08:00`);
  const from = date.parse(
    params.get("from") ?? new Date(+end - 29 * day).toISOString().slice(0, 10),
  );
  const start = new Date(`${from}T00:00:00+08:00`);
  if (+start > +end || +end - +start > 366 * day || to > today)
    throw new Error("Choose a past date range of up to one year.");
  const comparison = z
    .enum(["previous", "year"])
    .parse(params.get("comparison") ?? "previous");
  const duration = +end - +start + 1;
  const lastYear = (d: Date) => {
    const shifted = new Date(+d + 8 * 3600000);
    const month = shifted.getUTCMonth();
    shifted.setUTCFullYear(shifted.getUTCFullYear() - 1);
    if (shifted.getUTCMonth() !== month) shifted.setUTCDate(0);
    return new Date(+shifted - 8 * 3600000);
  };
  const previousStart =
    comparison === "year" ? lastYear(start) : new Date(+start - duration);
  const previousEnd =
    comparison === "year" ? lastYear(end) : new Date(+start - 1);
  return { from, to, start, end, previousStart, previousEnd, comparison };
}
export async function nativeReportDetails(
  workspaceId: string,
  currency: string,
  window: ReturnType<typeof nativeReportWindow>,
  pro: boolean,
) {
  const rows = await prisma.transaction.findMany({
    where: buildActiveWorkspaceTransactionWhere(workspaceId, {
      currency,
      date: { gte: window.previousStart, lte: window.end },
    }),
    select: {
      date: true,
      amount: true,
      type: true,
      isTransfer: true,
      merchantClean: true,
      merchantRaw: true,
      category: { select: { name: true } },
      account: { select: { id: true, name: true } },
    },
  });
  return buildNativeReportDetails(rows, window, pro);
}
export function buildNativeReportDetails(
  rows: {
    date: Date;
    amount: unknown;
    type: "income" | "expense" | "transfer";
    isTransfer: boolean;
    merchantClean: string | null;
    merchantRaw: string;
    category: { name: string } | null;
    account: { id: string; name: string };
  }[],
  window: ReturnType<typeof nativeReportWindow>,
  pro: boolean,
) {
  const current = { income: 0, expense: 0 },
    previous = { income: 0, expense: 0 };
  const days = new Map<string, { income: number; expense: number }>();
  const priorDays = new Map<string, number>();
  const categories = new Map<string, number>();
  const merchants = new Map<
    string,
    { amount: number; count: number; dates: Set<string> }
  >();
  const flows = new Map<
    string,
    { account: string; income: number; expense: number }
  >();
  const key = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  for (const row of rows) {
    const type = resolveFinancialTransactionType({
      ...row,
      categoryName: row.category?.name,
    });
    if (type !== "income" && type !== "expense") continue;
    const amount = Math.abs(Number(row.amount));
    if (!Number.isFinite(amount)) continue;
    const inCurrent = row.date >= window.start && row.date <= window.end;
    const inPrevious =
      row.date >= window.previousStart && row.date <= window.previousEnd;
    if (inPrevious) {
      previous[type] += amount;
      if (type === "expense") {
        const index = Math.floor((+row.date - +window.previousStart) / day);
        priorDays.set(
          String(index),
          (priorDays.get(String(index)) ?? 0) + amount,
        );
      }
    }
    if (!inCurrent) continue;
    current[type] += amount;
    const d = key(row.date);
    const daily = days.get(d) ?? { income: 0, expense: 0 };
    daily[type] += amount;
    days.set(d, daily);
    const flow = flows.get(row.account.id) ?? {
      account: row.account.name,
      income: 0,
      expense: 0,
    };
    flow[type] += amount;
    flows.set(row.account.id, flow);
    if (type === "expense") {
      const cat = row.category?.name ?? "Uncategorized";
      categories.set(cat, (categories.get(cat) ?? 0) + amount);
      const name = row.merchantClean || row.merchantRaw || "Other";
      const merchant = merchants.get(name) ?? {
        amount: 0,
        count: 0,
        dates: new Set<string>(),
      };
      merchant.amount += amount;
      merchant.count++;
      merchant.dates.add(d);
      merchants.set(name, merchant);
    }
  }
  let cumulative = 0,
    priorCumulative = 0;
  const pace = [];
  const daily = [];
  for (
    let cursor = +window.start, index = 0;
    cursor <= +window.end;
    cursor += day, index++
  ) {
    const date = key(new Date(cursor));
    const value = days.get(date) ?? { income: 0, expense: 0 };
    daily.push({ date, ...value });
    cumulative += value.expense;
    priorCumulative += priorDays.get(String(index)) ?? 0;
    pace.push({ date, current: cumulative, previous: priorCumulative });
  }
  const ranked = [...merchants]
    .map(([name, v]) => ({
      name,
      amount: v.amount,
      count: v.count,
      distinctDays: v.dates.size,
    }))
    .sort((a, b) => b.amount - a.amount);
  return {
    from: window.from,
    to: window.to,
    comparison: window.comparison,
    current,
    previous,
    days: daily,
    pace,
    categories: [...categories]
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount),
    merchants: ranked.slice(0, 10),
    repeats: ranked.filter((m) => m.distinctDays > 1).slice(0, 10),
    flows: pro
      ? [...flows.values()].sort(
          (a, b) => b.income + b.expense - (a.income + a.expense),
        )
      : [],
  };
}
