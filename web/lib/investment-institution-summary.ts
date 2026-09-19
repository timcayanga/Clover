import { formatCurrencyCode } from "@/lib/currency-format";
type InstitutionSummaryAccount = {id:string; name:string; investmentSymbol?:string|null; balance:string|null|undefined; updatedAt:string};
const parseAmount = (value:string|null|undefined) => Number(value ?? 0);
type AccountInvestmentSnapshot = {
  id: string;
  portfolioName: string | null;
  currency: string;
  updatedAt: string;
  account: { id: string; institution: string | null } | null;
  documentImport: { institution: string | null; currency: string } | null;
  holdings: Array<{
    id: string;
    assetName: string;
    assetSymbol: string | null;
    assetType: string | null;
    currentValue: string | null;
    marketValue: string | null;
    updatedAt: string;
  }>;
};

const normalizeInvestmentAssetKey = (symbol: string | null | undefined, name: string) =>
  (symbol?.trim() || name)
    .toLowerCase()
    .replace(/\bbitcoin segwit\b/g, "btc")
    .replace(/[^a-z0-9]+/g, "")
    .trim();

const isAggregateInvestmentHolding = (name: string, institution: string) => {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const normalizedInstitution = institution.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return (
    !normalized ||
    normalized === normalizedInstitution ||
    /^(?:portfolio|investments?|holdings?|assets?|dividends?|activity|transaction history)$/.test(normalized) ||
    normalized === `${normalizedInstitution} wallet`
  );
};

export const getInvestmentInstitutionSnapshotSummary = (
  institution: string,
  currency: string,
  accounts: InstitutionSummaryAccount[],
  snapshots: AccountInvestmentSnapshot[]
) => {
  if (institution.toLowerCase() === "gsave") return null;
  const accountIds = new Set(accounts.map((account) => account.id));
  const normalizedInstitution = institution.toLowerCase().trim();
  const latestSnapshots = new Map<string, AccountInvestmentSnapshot>();

  for (const snapshot of snapshots) {
    const snapshotCurrency = formatCurrencyCode(snapshot.currency || snapshot.documentImport?.currency || currency);
    const snapshotInstitution = (
      snapshot.account?.institution || snapshot.documentImport?.institution || snapshot.portfolioName || ""
    ).toLowerCase();
    if (
      snapshotCurrency !== currency ||
      ((!snapshot.account?.id || !accountIds.has(snapshot.account.id)) &&
        !snapshotInstitution.includes(normalizedInstitution))
    ) {
      continue;
    }
    const identity = snapshot.account?.id || snapshotInstitution;
    const current = latestSnapshots.get(identity);
    if (!current || new Date(snapshot.updatedAt).getTime() > new Date(current.updatedAt).getTime()) {
      latestSnapshots.set(identity, snapshot);
    }
  }

  const values = new Map<string, { value: number; updatedAt: number }>();
  for (const snapshot of latestSnapshots.values()) {
    for (const holding of snapshot.holdings) {
      if (isAggregateInvestmentHolding(holding.assetName, institution)) continue;
      const key = normalizeInvestmentAssetKey(holding.assetSymbol, holding.assetName);
      const value = Math.abs(parseAmount(holding.currentValue ?? holding.marketValue));
      if (!key || !Number.isFinite(value)) continue;
      const updatedAt = new Date(holding.updatedAt || snapshot.updatedAt).getTime();
      const current = values.get(key);
      if (!current || updatedAt >= current.updatedAt) values.set(key, { value, updatedAt });
    }
  }

  for (const account of accounts) {
    // The account hosting a holdings snapshot is the portfolio container, not
    // an extra position. Preserve overrides only when it identifies a holding.
    const ownedSnapshot = latestSnapshots.get(account.id);
    const ownsPositions = ownedSnapshot?.holdings.some(holding =>
      !isAggregateInvestmentHolding(holding.assetName, institution) &&
      (holding.currentValue !== null || holding.marketValue !== null)
    );
    const key = normalizeInvestmentAssetKey(account.investmentSymbol, account.name);
    if (!key || isAggregateInvestmentHolding(account.name, institution)) continue;
    if (ownsPositions && !ownedSnapshot?.holdings.some(holding => normalizeInvestmentAssetKey(holding.assetSymbol, holding.assetName) === key)) continue;
    const value = Math.abs(parseAmount(account.balance));
    // Account balances are the current projection. Snapshots remain immutable
    // import evidence, but must not make the Accounts card disagree with the
    // account-backed holding shown in Institution Details.
    values.set(key, { value, updatedAt: new Date(account.updatedAt).getTime() });
  }

  if (values.size === 0) return null;
  return {
    balance: Array.from(values.values()).reduce((sum, row) => sum + row.value, 0).toFixed(2),
    assetCount: values.size,
  };
};

