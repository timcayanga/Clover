/** Shared presentation rules; never rewrite a personal financial record. */
export const homeProducts = [
  {
    label: "Accounts",
    key: "accounts",
    href: "/accounts",
    icon: "business-outline",
  },
  {
    label: "Transactions",
    key: "transactions",
    href: "/transactions",
    icon: "swap-horizontal-outline",
  },
  {
    label: "Reports",
    key: "reports",
    href: "/reports",
    icon: "pie-chart-outline",
  },
  {
    label: "Ask Clover",
    key: "adviser",
    href: "/adviser",
    icon: "chatbubble-ellipses-outline",
  },
  {
    label: "Recurring",
    key: "recurring",
    href: "/recurring",
    icon: "repeat-outline",
  },
  {
    label: "Investments",
    key: "investments",
    href: "/investments",
    icon: "trending-up-outline",
  },
  {
    label: "Split Bills",
    key: "splitBills",
    href: "/split-bill",
    icon: "receipt-outline",
  },
  {
    label: "Circles",
    key: "circles",
    href: "/circles",
    icon: "people-outline",
  },
  {
    label: "Budgeting",
    key: "budgeting",
    href: "/budgeting",
    icon: "wallet-outline",
  },
  { label: "Goals", key: "goals", href: "/goals", icon: "flag-outline" },
] as const;
export const productPages = [
  homeProducts.slice(0, 4),
  homeProducts.slice(4, 8),
  homeProducts.slice(8),
];
export const properLabel = (text: string) =>
  text.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
export function suggestCircleDate(period: string, today = new Date()) {
  const d = new Date(today);
  const day = d.getDate();
  if (period === "weekly" || period === "biweekly")
    d.setDate(day + (period === "weekly" ? 7 : 14));
  else if (
    period === "monthly" ||
    period === "quarterly" ||
    period === "annual"
  ) {
    const months = period === "monthly" ? 1 : period === "quarterly" ? 3 : 12;
    d.setDate(1);
    d.setMonth(d.getMonth() + months);
    d.setDate(
      Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()),
    );
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function currencyTotals(rows: { amount: number; currency: string }[]) {
  const totals: Record<string, number> = {};
  for (const row of rows)
    if (Number.isFinite(row.amount))
      totals[row.currency] = (totals[row.currency] ?? 0) + row.amount;
  return totals;
}
export function circlePeriodStart(
  cadence: string,
  now: Date,
  startsAt?: Date | null,
) {
  if (cadence === "once") return startsAt ?? new Date(0);
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (cadence === "annual") d.setMonth(0, 1);
  else if (cadence === "quarterly")
    d.setMonth(Math.floor(d.getMonth() / 3) * 3, 1);
  else if (cadence === "monthly") d.setDate(1);
  else if (cadence === "weekly" || cadence === "biweekly")
    d.setDate(
      d.getDate() - ((d.getDay() + 6) % 7) - (cadence === "biweekly" ? 7 : 0),
    );
  return d;
}
