export type TransactionFilters = {
  types: string[]; accounts: string[]; categories: string[]; tags: string[];
  currency: string; amountMin: string; amountMax: string;
  dateFilterMode: string; customStart: string; customEnd: string;
  sourceFilter: string; confidenceFilter: string; reviewFilter: string;
};
export const emptyTransactionFilters: TransactionFilters = {
  types: [], accounts: [], categories: [], tags: [], currency: "", amountMin: "", amountMax: "",
  dateFilterMode: "ltd", customStart: "", customEnd: "", sourceFilter: "", confidenceFilter: "", reviewFilter: "",
};
export type FilterOptions = {
  accounts: { id: string; name: string; currency: string }[];
  categories: { id: string; name: string }[]; tags: { id: string; name: string }[];
};
export function transactionFilterQuery(filters: TransactionFilters) {
  const params = new URLSearchParams();
  for (const key of ["types", "accounts", "categories"] as const) {
    if (filters[key].length) params.set(key, filters[key].join(","));
  }
  filters.tags.forEach(tag => params.append("tag", tag));
  for (const key of ["currency", "amountMin", "amountMax", "dateFilterMode", "customStart", "customEnd", "sourceFilter", "confidenceFilter", "reviewFilter"] as const) {
    if (filters[key]) params.set(key, filters[key]);
  }
  params.set("dateFilterAnchor", new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()));
  return params.toString();
}

import type { Transaction } from "./types";
export function demoFilterOptions(rows: Transaction[]): FilterOptions {
  return {
    accounts: [...new Map(rows.map(r => [r.accountId,{id:r.accountId,name:r.accountName,currency:r.currency}])).values()],
    categories: [...new Map(rows.filter(r=>r.categoryId).map(r=>[r.categoryId!,{id:r.categoryId!,name:r.categoryName??"Uncategorized"}])).values()],
    tags: [...new Map(rows.flatMap(r=>r.tags??[]).map(t=>[t.id,t])).values()],
  };
}
export function matchesDemoFilters(row: Transaction, filters: TransactionFilters) {
  const type = row.isTransfer || row.type === "transfer" ? "transfer" : row.type === "income" ? "credit" : "debit";
  if(filters.types.length && !filters.types.includes(type)) return false;
  if(filters.accounts.length && !filters.accounts.includes(row.accountId)) return false;
  if(filters.categories.length && !filters.categories.includes(row.categoryId??"")) return false;
  if(filters.tags.length && !row.tags?.some(t=>filters.tags.includes(t.id))) return false;
  if(filters.currency && row.currency !== filters.currency) return false;
  const amount = Math.abs(Number(row.amount));
  if(filters.amountMin && amount < Number(filters.amountMin)) return false;
  if(filters.amountMax && amount > Number(filters.amountMax)) return false;
  if(filters.sourceFilter && row.source !== filters.sourceFilter) return false;
  if(filters.reviewFilter === "confirmed" && row.reviewStatus !== "confirmed") return false;
  if(filters.reviewFilter === "pending" && ["confirmed","rejected","duplicate_skipped"].includes(row.reviewStatus??"")) return false;
  if(filters.confidenceFilter) {
    const confidence = row.confidenceScore;
    if(confidence == null) return false;
    const percent = confidence <= 1 ? confidence * 100 : confidence;
    if(filters.confidenceFilter === "high" && percent < 85) return false;
    if(filters.confidenceFilter === "medium" && (percent < 65 || percent >= 85)) return false;
    if(filters.confidenceFilter === "low" && percent >= 65) return false;
  }
  if(filters.dateFilterMode !== "ltd") {
    const anchor = new URLSearchParams(transactionFilterQuery(filters)).get("dateFilterAnchor")!;
    const start = new Date(`${anchor}T00:00:00Z`), end = new Date(start);
    switch(filters.dateFilterMode) {
      case "week": start.setUTCDate(start.getUTCDate()-((start.getUTCDay()+6)%7)); end.setTime(start.getTime()); end.setUTCDate(end.getUTCDate()+6); break;
      case "month": start.setUTCDate(1); end.setUTCMonth(end.getUTCMonth()+1,0); break;
      case "quarter": start.setUTCMonth(Math.floor(start.getUTCMonth()/3)*3,1); end.setUTCMonth(start.getUTCMonth()+3,0); break;
      case "year": start.setUTCMonth(0,1); end.setUTCMonth(11,31); break;
    }
    const from = filters.dateFilterMode === "custom" ? filters.customStart : start.toISOString().slice(0,10);
    const to = filters.dateFilterMode === "custom" ? filters.customEnd : end.toISOString().slice(0,10);
    const date = row.date.slice(0,10);
    if ((from && date < from) || (to && date > to)) return false;
  }
  return true;
}
