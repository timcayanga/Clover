import { z } from "zod";
import {
  defaultReportView,
  validReportDate,
  type ReportView,
} from "../../shared/reports/analysis";
export const reportViewSchema = z
  .object({
    section: z
      .enum(["overview", "spending", "trends", "advanced"])
      .default("overview"),
    range: z
      .enum(["7d", "30d", "90d", "ytd", "12m", "all", "custom"])
      .default("30d"),
    from: z.string().max(10).default(""),
    to: z.string().max(10).default(""),
    currency: z
      .string()
      .regex(/^(?:[A-Z]{3})?$/)
      .default(""),
    accounts: z.array(z.string().min(1).max(128)).max(100).default([]),
    categories: z.array(z.string().min(1).max(160)).max(100).default([]),
    review: z.enum(["all", "confirmed", "pending"]).default("all"),
    transfers: z.enum(["exclude", "include", "only"]).default("exclude"),
    compare: z.enum(["previous", "year"]).default("previous"),
    chart: z.enum(["Donut", "Bars", "Table"]).default("Donut"),
    trendCategories: z.array(z.string().max(160)).max(6).default([]),
  })
  .strict()
  .refine(
    (v) =>
      v.range !== "custom" ||
      (validReportDate(v.from) && validReportDate(v.to) && v.from <= v.to),
    "Choose valid custom dates.",
  );
export function reportViewFromParams(p: URLSearchParams): ReportView {
  const list = (key: string) => {
    const raw = p.get(key);
    if (!raw) return [];
    try {
      const v = JSON.parse(raw);
      if (Array.isArray(v)) return v;
    } catch {}
    return raw.split(",");
  };
  return reportViewSchema.parse({
    ...defaultReportView,
    ...Object.fromEntries(
      [
        "section",
        "range",
        "from",
        "to",
        "currency",
        "review",
        "transfers",
        "compare",
        "chart",
      ].flatMap((k) => (p.has(k) ? [[k, p.get(k)]] : [])),
    ),
    ...(p.get("from") && p.get("to") ? { range: "custom" } : {}),
    accounts: p.get("accountId") ? [p.get("accountId")!] : list("accounts"),
    categories: list("categories"),
    trendCategories: list("trendCategories"),
  });
}
