import { bankTransactionMatches } from "./finverse-matching";

type Row = {
  accountId: unknown; date: unknown; amount: unknown; currency: unknown; type: unknown;
  merchantRaw?: unknown; merchantClean?: unknown; description?: unknown;
};
const text = (value: unknown) => typeof value === "string" ? value : null;
const key = (row: Row) => {
  const date = row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10);
  const amount = Number(String(row.amount));
  return Number.isFinite(amount) ? [row.accountId, date, amount.toFixed(2), row.currency, row.type].join("|") : null;
};
/** One-to-one evidence matching; never mutate an existing bank/manual ledger row. */
export function createBankImportOverlapMatcher(rows: Array<Row & { id: string }>) {
  const buckets = new Map<string, Array<Row & { id: string }>>();
  const claimed = new Set<string>();
  for (const row of rows) {
    const identity = key(row);
    if (identity) buckets.set(identity, [...(buckets.get(identity) ?? []), row]);
  }
  return (incoming: Row): "matched" | "ambiguous" | "new" => {
    const candidates = (buckets.get(key(incoming) ?? "") ?? []).filter(row => !claimed.has(row.id));
    const fields = (row: Row) => ({ merchantRaw: text(row.merchantRaw), merchantClean: text(row.merchantClean), description: text(row.description) });
    const match = candidates.find(row => bankTransactionMatches(fields(row), fields(incoming)));
    if (match) { claimed.add(match.id); return "matched"; }
    return candidates.length ? "ambiguous" : "new";
  };
}
