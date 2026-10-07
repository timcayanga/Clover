import {
  emptyTransactionFilters,
  type TransactionFilters,
} from "./transaction-filter-query";
import { validReportDate } from "../../shared/reports/analysis";
export function reportTransactionFilters(
  value: string,
): { filters: TransactionFilters; merchant: string } | null {
  if (value.length > 16000) return null;
  const p = new URLSearchParams(value),
    from = p.get("customStart") ?? "",
    to = p.get("customEnd") ?? "";
  if (!validReportDate(from) || !validReportDate(to) || from > to) return null;
  const list = (key: string) =>
    (p.get(key) ?? "").split(",").filter(Boolean).slice(0, 100);
  const currency = p.get("currency") ?? "";
  if (!/^[A-Z]{3}$/.test(currency)) return null;
  return {
    filters: {
      ...emptyTransactionFilters,
      currency,
      dateFilterMode: "custom",
      customStart: from,
      customEnd: to,
      accounts: list("accounts"),
      categories: list("categories"),
      types: list("types").filter((t) =>
        ["credit", "debit", "transfer"].includes(t),
      ),
      reviewFilter: ["confirmed", "pending"].includes(
        p.get("reviewFilter") ?? "",
      )
        ? p.get("reviewFilter")!
        : "",
      merchants: p.getAll("merchant").slice(0, 100),
      merchantMatch: p.get("merchantMatch") === "exact" ? "exact" : undefined,
      tags: p.getAll("tag").slice(0, 100),
    },
    merchant: p.get("merchant") ?? "",
  };
}
