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
  startingValue?: string | null;
  institutionLogoUrl?: string | null;
  logoUrl?:string|null;
  positionId?:string;
  positionRevision?:number;
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
  completeHistory = true,
): PortfolioHolding[] {
  const latest = new Map<string, PortfolioSnapshot>();
  for (const snapshot of [...snapshots].sort(
    (a, b) => Date.parse(b.date) - Date.parse(a.date),
  ))
    if (snapshot.accountId && !latest.has(snapshot.accountId))
      latest.set(snapshot.accountId, snapshot);
  const firstValues = new Map<string, { date: string; value: string }>();
  const historyKey = (accountId: string, h: PortfolioSnapshot["holdings"][number]) =>
    JSON.stringify([accountId, h.currency, key(h.symbol || h.name)]);
  if (completeHistory) {
    for (const snapshot of snapshots) {
      if (!snapshot.accountId) continue;
      for (const h of snapshot.holdings) {
        if (h.value === null || recordedNumber(h.value) === null) continue;
        const id = historyKey(snapshot.accountId, h);
        const previous = firstValues.get(id);
        if (!previous || Date.parse(snapshot.date) < Date.parse(previous.date))
          firstValues.set(id, { date: snapshot.date, value: h.value });
      }
    }
  }
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
      const opening = firstValues.get(historyKey(account.id, h));
      rows.push({
        startingValue: match?.investmentPrincipal ?? (opening && Date.parse(opening.date) < Date.parse(snapshot!.date) ? opening.value : null),
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
        startingValue: a.investmentPrincipal,
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

export function portfolioAssetKey(h: { currency: string; name: string; subtype: string | null; symbol: string | null }) {
  const symbol = key(h.symbol);
  const identity = h.subtype === "crypto" && symbol ? symbol : [symbol, key(h.name)];
  return JSON.stringify([h.currency, h.subtype, identity]);
}

function holdingTotal(holdings: PortfolioHolding[], field: "value" | "startingValue") {
  let sum = 0;
  for (const h of holdings) {
    const n = recordedNumber(h[field]);
    if (n === null) return null;
    sum += n;
  }
  return String(sum);
}

export function portfolioInstitutionKey(row: {institution: string | null; currency: string}) {
  return JSON.stringify([key(row.institution), row.currency]);
}

export function portfolioInstitutions(holdings: PortfolioHolding[], completeHistory: RecordedValuation[] = []) {
  const groups = new Map<string, PortfolioHolding[]>();
  for (const holding of holdings) {
    const id = portfolioInstitutionKey(holding);
    const group = groups.get(id);
    if (group) group.push(holding);
    else groups.set(id, [holding]);
  }
  return Array.from(groups, ([id, members]) => {
    const first = members[0];
    const name = first.institution?.trim() || "Other investments";
    // A statement total covers the whole account. Only use it when the displayed
    // holdings all come from that account, in the statement currency.
    let startingValue = holdingTotal(members, "startingValue");
    if (startingValue === null && first.valuationAccountId && first.date &&
        members.every(h => h.valuationAccountId === first.valuationAccountId && h.date === first.date)) {
      const opening = completeHistory.filter(v => v.accountId === first.valuationAccountId &&
        v.currency === first.currency && v.date.slice(0, 10) < first.date!.slice(0, 10))
        .sort((a, b) => a.date.localeCompare(b.date))[0];
      if (opening) startingValue = String(opening.value);
    }
    const row: PortfolioHolding = {
      id, accountId: first.accountId, source: "account", name, institution: first.institution,
      subtype: "institution", symbol: null, currency: first.currency, quantity: null, cost: null, date: null,
      logoUrl: members.find(h => h.institutionLogoUrl)?.institutionLogoUrl,
      value: holdingTotal(members, "value"), startingValue,
    };
    return { row, count: members.length };
  });
}

/** Combine positions only for display. Each source keeps its own details and actions. */
export function portfolioAssetGroups(holdings: PortfolioHolding[]) {
  const groups = new Map<string, PortfolioHolding[]>();
  for (const h of holdings) {
    const id = portfolioAssetKey(h);
    const members = groups.get(id);
    if (members) members.push(h);
    else groups.set(id, [h]);
  }
  return Array.from(groups, ([id, members]) => {
    const first = members[0];
    const holding = members.length === 1 ? first : {
      ...first, name: first.subtype === "crypto" && key(first.symbol) === "btc" ? "Bitcoin" : first.name,
      value: holdingTotal(members, "value"), startingValue: holdingTotal(members, "startingValue"),
    };
    return { id, holding, members };
  });
}

export function holdingBalanceChange(h: PortfolioHolding) {
  const opening = recordedNumber(h.startingValue);
  const current = recordedNumber(h.value);
  return balanceChangePercent(current, opening);
}

export function balanceChangePercent(current: number | null, opening?: number | null) {
  if (opening == null || opening <= 0 || current === null) return null;
  const change = Math.round(100 * (current - opening) / opening);
  return Number.isFinite(change) ? change : null;
}
