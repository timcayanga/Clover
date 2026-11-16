import type { Transaction } from "../types";
export type DownloadedHistory = {
  rows: Transaction[];
  total: number;
  complete: boolean;
  downloadedAt?: string;
};
/** Totals use integer minor units, separate currencies, and never model arithmetic. */
export function localSpending(history: DownloadedHistory, now = new Date()) {
  const month = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
  }).format(now);
  const totals = new Map<
    string,
    { income: bigint; spending: bigint; digits: number }
  >();
  let ignored = 0;
  for (const row of history.rows) {
    if (row.type === "transfer" || row.isTransfer || row.isExcluded) continue;
    const date = new Date(row.date);
    if (!Number.isFinite(date.getTime())) {
      ignored++;
      continue;
    }
    if (
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "2-digit",
      }).format(date) !== month
    )
      continue;
    const currency = row.currency.toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      ignored++;
      continue;
    }
    const digits =
      new Intl.NumberFormat("en", {
        style: "currency",
        currency,
      }).resolvedOptions().maximumFractionDigits ?? 2;
    const m = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(row.amount);
    if (!m || (m[3]?.slice(digits).replace(/0/g, "").length ?? 0) > 0) {
      ignored++;
      continue;
    }
    const amount =
      BigInt(m[2]) * 10n ** BigInt(digits) +
      BigInt((m[3] ?? "").slice(0, digits).padEnd(digits, "0") || "0");
    const total = totals.get(currency) ?? { income: 0n, spending: 0n, digits };
    if (row.type === "income") total.income += amount;
    else if (row.type === "expense") total.spending += amount;
    totals.set(currency, total);
  }
  const decimal = (n: bigint, d: number) =>
    d
      ? `${n / 10n ** BigInt(d)}.${String(n % 10n ** BigInt(d)).padStart(d, "0")}`
      : String(n);
  const lines = [
    `This month (${month}, Asia/Manila) · downloaded records`,
    ...Array.from(
      totals,
      ([c, t]) =>
        `${c}: income ${decimal(t.income, t.digits)} · spending ${decimal(t.spending, t.digits)}`,
    ),
  ];
  if (!totals.size)
    lines.push(
      "No included transactions found for this month in the downloaded history.",
    );
  lines.push(
    `${history.rows.length} of ${history.total} transactions downloaded. ${history.complete ? "All downloaded pages accounted for." : "Partial history: these figures may omit records."}`,
    "Transfers and excluded transactions are omitted. Pending changes are not included.",
  );
  if (history.downloadedAt)
    lines.push(
      `Downloaded ${new Date(history.downloadedAt).toLocaleString()}. Newer changes require another Profile download.`,
    );
  if (ignored)
    lines.push(`${ignored} records could not be calculated and need review.`);
  return lines.join("\n");
}
/** Exact prior confirmed merchant matches only; a suggestion never writes records. */
export function suggestLocalCategory(merchant: string, rows: Transaction[]) {
  const key = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  const matches = rows.filter(
    (r) =>
      ["confirmed", "edited"].includes(r.reviewStatus ?? "") &&
      key(r.merchantRaw) === key(merchant) &&
      r.categoryName &&
      !r.pendingSync,
  );
  const categories = [...new Set(matches.map((r) => r.categoryName!))];
  return categories.length === 1 && matches.length >= 2
    ? {
        category: categories[0],
        confidence: 85,
        reason: `Matches ${matches.length} downloaded, confirmed entries for this exact merchant. Review before applying.`,
      }
    : null;
}
