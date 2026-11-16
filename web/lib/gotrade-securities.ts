const GOTRADE_SECURITY_CATALOG = [
  { symbol: "AMZN", name: "Amazon" },
  { symbol: "GOOGL", name: "Alphabet Inc Class A - Google" },
  { symbol: "O", name: "Realty Income" },
  { symbol: "PG", name: "Procter & Gamble" },
  { symbol: "SCHD", name: "Schwab US Dividend Equity ETF" },
  { symbol: "VOO", name: "Vanguard S&P 500 ETF" },
  { symbol: "VZ", name: "Verizon" },
  { symbol: "XOM", name: "Exxon Mobil" },
] as const;

const normalizeSecurityIdentity = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

const findGotradeSecurity = (symbolOrName: string) => {
  const normalized = normalizeSecurityIdentity(symbolOrName);
  if (!normalized) {
    return null;
  }

  return (
    GOTRADE_SECURITY_CATALOG.find(
      (security) =>
        security.symbol.toLowerCase() === normalized ||
        security.name.toLowerCase() === normalized ||
        normalized.includes(security.name.toLowerCase())
    ) ?? null
  );
};

export const getGotradeSecurityName = (symbolOrName: string) => {
  const normalized = normalizeSecurityIdentity(symbolOrName);
  if (normalized.includes("alphabet") && normalized.includes("google")) {
    return "Alphabet Inc Class A - Google";
  }
  if (normalized.includes("schwab us dividend")) {
    return "Schwab US Dividend Equity ETF";
  }
  return findGotradeSecurity(symbolOrName)?.name ?? symbolOrName.trim().replace(/\s+/g, " ");
};

export const getGotradeSecuritySymbol = (symbolOrName: string | null | undefined) => {
  const candidate = symbolOrName?.trim() ?? "";
  const normalized = normalizeSecurityIdentity(candidate);
  if (!normalized) {
    return null;
  }
  if (normalized.includes("alphabet") && normalized.includes("google")) {
    return "GOOGL";
  }
  if (normalized.includes("schwab us dividend")) {
    return "SCHD";
  }
  return findGotradeSecurity(candidate)?.symbol ?? null;
};

export const resolveGotradeSecuritySymbol = (params: {
  institution?: string | null;
  name?: string | null;
  symbol?: string | null;
}) => {
  const savedSymbol = params.symbol?.trim().toUpperCase() ?? "";
  if (savedSymbol && savedSymbol !== "USD") {
    return savedSymbol;
  }
  if (!/\bgo\s*trade\b/i.test(params.institution ?? "")) {
    return savedSymbol || null;
  }
  return getGotradeSecuritySymbol(params.name);
};
