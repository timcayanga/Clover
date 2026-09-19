/** Read-only portfolio projection shared with native clients. Never mutates records. */
export type PortfolioAccount = {
  id: string;
  name: string;
  institution: string | null;
  type: string;
  currency: string;
  balance: string | null;
  investmentSubtype?: string | null;
  investmentSymbol?: string | null;
  investmentQuantity?: string | null;
  investmentCostBasis?: string | null;
  investmentPrincipal?: string | null;
  investmentStartDate?: string | null;
  updatedAt?: string;
  source?: string;
};
export type PortfolioSnapshot = {
  id: string;
  accountId: string | null;
  institution: string | null;
  date: string;
  currency: string;
  totalValue: string | null;
  holdings: {
    id: string;
    name: string;
    symbol: string | null;
    subtype: string | null;
    currency: string;
    quantity: string | null;
    value: string | null;
    cost: string | null;
  }[];
};
export type PortfolioHolding = {
  id: string;
  accountId: string;
  valuationAccountId?: string;
  accountType?: string;
  source: "account" | "snapshot";
  name: string;
  institution: string | null;
  subtype: string;
  symbol: string | null;
  currency: string;
  quantity: string | null;
  value: string | null;
  cost: string | null;
  date: string | null;
};
export const recordedNumber = (value: string | null | undefined) => {
  if (value == null || !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const key = (value: string | null | undefined) =>
  (value || "").trim().toLowerCase().replace(/\s+/g, " ");
export function projectPortfolio(
  accounts: PortfolioAccount[],
  snapshots: PortfolioSnapshot[],
): PortfolioHolding[] {
  const latest = new Map<string, PortfolioSnapshot>();
  for (const snapshot of [...snapshots].sort(
    (a, b) => Date.parse(b.date) - Date.parse(a.date),
  ))
    if (snapshot.accountId && !latest.has(snapshot.accountId))
      latest.set(snapshot.accountId, snapshot);
  const rows: PortfolioHolding[] = [];
  const covered = new Set<string>();
  for (const account of [...accounts].sort(
    (a, b) =>
      Date.parse(latest.get(b.id)?.date ?? "1970-01-01") -
      Date.parse(latest.get(a.id)?.date ?? "1970-01-01"),
  )) {
    const snapshot = latest.get(account.id);
    const holdings =
      snapshot?.holdings.filter(
        (h) =>
          h.name.trim() &&
          ![
            key(account.institution),
            key(snapshot.institution),
            "portfolio",
            "investments",
            "holdings",
            "assets",
          ].includes(key(h.name)) &&
          !/^(dividends?|dividend income|withholding tax)$/i.test(h.name),
      ) ?? [];
    if (!holdings.length) continue;
    covered.add(account.id);
    for (const h of holdings) {
      // A linked individual account and its uploaded holding are one position.
      const match = accounts.find(
        (a) =>
          a.currency === h.currency &&
          !!key(account.institution) &&
          key(a.institution) === key(account.institution) &&
          key(a.investmentSymbol || a.name) === key(h.symbol || h.name),
      );
      if (match) covered.add(match.id);
      if (
        match &&
        rows.some((r) => r.accountId === match.id && r.currency === h.currency)
      )
        continue;
      rows.push({
        id: h.id,
        accountId: match?.id ?? account.id,
        accountType: match?.type ?? account.type,
        valuationAccountId: account.id,
        source: "snapshot",
        name: h.name,
        institution: account.institution || snapshot!.institution,
        subtype: h.subtype || "other",
        symbol: h.symbol,
        currency: h.currency,
        quantity: h.quantity,
        value: h.value,
        cost: h.cost,
        date: snapshot!.date,
      });
    }
  }
  for (const a of accounts)
    if (!covered.has(a.id))
      rows.push({
        id: a.id,
        accountId: a.id,
        accountType: a.type,
        source: "account",
        name: a.name,
        institution: a.institution,
        subtype: a.investmentSubtype || "other",
        symbol: a.investmentSymbol || null,
        currency: a.currency,
        quantity: a.investmentQuantity || null,
        value: a.balance,
        cost: a.investmentCostBasis ?? a.investmentPrincipal ?? null,
        date: a.updatedAt || null,
      });
  // Multiple uploaded institution rows can refer to the same holding ID.
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}
export type RecordedValuation = {
  accountId: string;
  date: string;
  currency: string;
  value: number;
};
export function recordedPortfolioSeries(
  values: RecordedValuation[],
  currency: string,
  accountIds: string[],
) {
  const selected = new Set(accountIds);
  const rows = values
    .filter(
      (v) =>
        selected.has(v.accountId) &&
        v.currency === currency &&
        Number.isFinite(v.value) &&
        Number.isFinite(Date.parse(v.date)),
    )
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const current = new Map<string, number>();
  const points: { date: string; value: number; accounts: number }[] = [];
  for (const row of rows) {
    current.set(row.accountId, row.value);
    const date = row.date.slice(0, 10),
      value = [...current.values()].reduce((n, v) => n + v, 0);
    const point = { date, value, accounts: current.size };
    if (points.at(-1)?.date === date) points[points.length - 1] = point;
    else points.push(point);
  }
  return points;
}
