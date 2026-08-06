export type PdaxPortfolioAccount = {
  name: "Wallet" | "BTC" | "XRP" | "Gold";
  balance: number;
  type: "wallet" | "investment";
  subtype: string | null;
  symbol: string | null;
  quantity: number | null;
};

export type PdaxInvestmentHoldingInput = {
  assetName: string;
  assetSymbol?: string | null;
  assetType?: string | null;
  quantity?: string | number | null;
  marketValue?: string | number | null;
  currentValue?: string | number | null;
};

type PdaxPortfolioEvidence = Record<string, unknown>;

const accountNames = new Set<PdaxPortfolioAccount["name"]>(["Wallet", "BTC", "XRP", "Gold"]);

const finiteAmount = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const normalized = Number(value.replace(/,/g, "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(normalized) ? normalized : null;
  }
  return null;
};

const readAccountName = (value: unknown): PdaxPortfolioAccount["name"] | null => {
  const normalized = typeof value === "string" ? value.trim() : "";
  return accountNames.has(normalized as PdaxPortfolioAccount["name"])
    ? (normalized as PdaxPortfolioAccount["name"])
    : null;
};

/**
 * Produces only the concrete PDAX portfolio accounts backed by deterministic
 * screenshot evidence. It deliberately excludes aggregate buckets such as
 * Crypto Balance, Bonds, and the portfolio heading.
 */
export const readPdaxPortfolioAccount = (
  evidence: PdaxPortfolioEvidence,
  options: { requireScreenshotSource?: boolean } = {}
): PdaxPortfolioAccount | null => {
  if (options.requireScreenshotSource && evidence.source !== "pdax_portfolio_screenshot") {
    return null;
  }

  const name = readAccountName(evidence.accountName);
  const balance = finiteAmount(evidence.statementEndingBalance ?? evidence.balance);
  const type = evidence.accountType === "wallet" ? "wallet" : evidence.accountType === "investment" ? "investment" : null;
  if (!name || balance === null || !type || (name === "Wallet") !== (type === "wallet")) {
    return null;
  }

  const quantity = finiteAmount(evidence.quantity);
  return {
    name,
    balance,
    type,
    subtype: typeof evidence.investmentSubtype === "string" ? evidence.investmentSubtype : null,
    symbol: typeof evidence.investmentSymbol === "string" ? evidence.investmentSymbol : null,
    quantity,
  };
};

export const readPublishedPdaxPortfolioAccount = (summary: PdaxPortfolioEvidence): PdaxPortfolioAccount | null => {
  if (typeof summary.institution !== "string" || summary.institution.trim().toUpperCase() !== "PDAX") {
    return null;
  }
  return readPdaxPortfolioAccount(summary);
};

const normalizeHoldingLabel = (value: string | null | undefined) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ");

export const isPdaxWalletHoldingLabel = (holding: PdaxInvestmentHoldingInput) => {
  const name = normalizeHoldingLabel(holding.assetName);
  const symbol = normalizeHoldingLabel(holding.assetSymbol);
  return (
    symbol === "php" ||
    new Set(["wallet", "pdax wallet", "php wallet", "cash", "cash balance", "fiat wallet"]).has(name)
  );
};

export const getCanonicalPdaxHoldingIdentity = (holding: PdaxInvestmentHoldingInput) => {
  const symbol = normalizeHoldingLabel(holding.assetSymbol).toUpperCase();
  const name = normalizeHoldingLabel(holding.assetName);
  if (symbol === "XRP" || name === "xrp" || name === "ripple") {
    return { key: "XRP", assetName: "XRP", assetSymbol: "XRP", assetType: "crypto" };
  }
  if (symbol === "BTC" || name === "btc" || /^bitcoin(?: segwit)?$/.test(name)) {
    return { key: "BTC", assetName: "BTC", assetSymbol: "BTC", assetType: "crypto" };
  }

  const fallbackKey = symbol || name;
  return {
    key: fallbackKey,
    assetName: holding.assetName.trim(),
    assetSymbol: holding.assetSymbol?.trim() || null,
    assetType: holding.assetType ?? null,
  };
};

const holdingEvidenceScore = (holding: PdaxInvestmentHoldingInput) => {
  const identity = getCanonicalPdaxHoldingIdentity(holding);
  return (
    Number(holding.assetSymbol?.trim().toUpperCase() === identity.assetSymbol) * 5 +
    Number(holding.assetName.trim().toUpperCase() === identity.assetName.toUpperCase()) * 4 +
    Number(Boolean(holding.assetSymbol?.trim())) * 3 +
    Number(finiteAmount(holding.quantity) !== null) * 2 +
    Number(finiteAmount(holding.currentValue ?? holding.marketValue) !== null)
  );
};

export const canonicalizePdaxInvestmentHoldings = <T extends PdaxInvestmentHoldingInput>(holdings: T[]) => {
  const canonicalByKey = new Map<string, T>();
  const evidenceScoreByKey = new Map<string, number>();
  for (const holding of holdings) {
    if (isPdaxWalletHoldingLabel(holding)) {
      continue;
    }

    const identity = getCanonicalPdaxHoldingIdentity(holding);
    if (!identity.key) {
      continue;
    }

    const canonical = {
      ...holding,
      assetName: identity.assetName,
      assetSymbol: identity.assetSymbol,
      assetType: identity.assetType ?? holding.assetType ?? null,
    } as T;
    const evidenceScore = holdingEvidenceScore(holding);
    if (!canonicalByKey.has(identity.key) || evidenceScore > (evidenceScoreByKey.get(identity.key) ?? -1)) {
      canonicalByKey.set(identity.key, canonical);
      evidenceScoreByKey.set(identity.key, evidenceScore);
    }
  }

  return Array.from(canonicalByKey.values());
};
