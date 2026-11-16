/** Exact security identities only. Ambiguous names require the user's share-class choice. */
type Security = { symbol: string; name: string; aliases: string[]; currency: string; market: "us" | "ph" | "crypto"; subtype: string };
const security = (symbol: string, name: string, aliases: string[], currency = "USD", market: Security["market"] = "us", subtype = "stock"): Security => ({ symbol, name, aliases, currency, market, subtype });
const SECURITIES: Security[] = [
  security("AAPL", "Apple", ["Apple Inc", "Apple Incorporated"]),
  security("MSFT", "Microsoft", ["Microsoft Corporation"]),
  security("AMZN", "Amazon", ["Amazon.com", "Amazon.com Inc"]),
  security("TSLA", "Tesla", ["Tesla Inc"]),
  security("NVDA", "NVIDIA", ["NVIDIA Corporation"]),
  security("META", "Meta Platforms", ["Meta", "Meta Platforms Inc"]),
  security("GOOGL", "Alphabet Class A", ["Google", "Alphabet", "Alphabet Inc Class A", "Alphabet Inc Class A - Google"]),
  security("GOOG", "Alphabet Class C", ["Google", "Alphabet", "Alphabet Inc Class C"]),
  security("BRK.A", "Berkshire Hathaway Class A", ["Berkshire Hathaway", "Berkshire"]),
  security("BRK.B", "Berkshire Hathaway Class B", ["Berkshire Hathaway", "Berkshire", "BRK-B"]),
  security("O", "Realty Income", ["Realty Income Corporation"], "USD", "us", "reit"),
  security("PG", "Procter & Gamble", ["Procter and Gamble"]),
  security("VZ", "Verizon", ["Verizon Communications"]),
  security("XOM", "Exxon Mobil", ["ExxonMobil"]),
  security("VOO", "Vanguard S&P 500 ETF", ["Vanguard S&P 500"], "USD", "us", "etf"),
  security("SCHD", "Schwab US Dividend Equity ETF", ["Schwab US Dividend Equity"], "USD", "us", "etf"),
  security("BPI", "Bank of the Philippine Islands", ["BPI"], "PHP", "ph"),
  security("JFC", "Jollibee Foods Corporation", ["Jollibee", "Jollibee Foods"], "PHP", "ph"),
  security("SM", "SM Investments Corporation", ["SM Investments"], "PHP", "ph"),
  security("SMPH", "SM Prime Holdings", ["SM Prime"], "PHP", "ph"),
  security("AC", "Ayala Corporation", [], "PHP", "ph"),
  security("ALI", "Ayala Land", ["Ayala Land Inc"], "PHP", "ph"),
  security("BDO", "BDO Unibank", ["BDO"], "PHP", "ph"),
  security("MBT", "Metropolitan Bank & Trust", ["Metrobank", "Metropolitan Bank and Trust Company"], "PHP", "ph"),
  security("TEL", "PLDT", ["PLDT Inc"], "PHP", "ph"),
  security("GLO", "Globe Telecom", [], "PHP", "ph"),
  security("URC", "Universal Robina Corporation", ["Universal Robina"], "PHP", "ph"),
  security("AREIT", "AREIT", ["AREIT Inc"], "PHP", "ph", "reit"),
  security("BTC", "Bitcoin", [], "USD", "crypto", "crypto"),
  security("ETH", "Ethereum", [], "USD", "crypto", "crypto"),
  security("SOL", "Solana", [], "USD", "crypto", "crypto"),
  security("XRP", "XRP", ["Ripple"], "USD", "crypto", "crypto"),
];
const identity = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export function investmentTickerMatches(name: string, subtype: string, currency: string) {
  const key = identity(name);
  if (!key) return [];
  const candidates = SECURITIES.filter(item => item.subtype === subtype);
  // A company name identifies its listing independently of the selected display
  // currency. A bare ticker can collide across exchanges, so it requires a market.
  const named = candidates.filter(item => [item.name, ...item.aliases]
    .some(alias => identity(alias) !== identity(item.symbol) && identity(alias) === key));
  const matched = named.length ? named : candidates.filter(item => identity(item.symbol) === key &&
    (item.market === "crypto" || item.currency === currency.toUpperCase()));
  return matched.map(item => ({ symbol: item.symbol, name: item.name, currency: item.currency, market: item.market, confidence: 99, reason: named.length ? "Exact security name match" : "Exact ticker and market match" }));
}
export function investmentNameLabel(subtype: string) {
  if (subtype === "stock") return "Stock Name";
  if (subtype === "crypto") return "Crypto Name";
  if (["etf", "mutual_fund", "money_market_fund", "uitf"].includes(subtype)) return "Fund Name";
  if (subtype === "reit") return "REIT Name";
  if (subtype === "bond") return "Bond Name";
  return "Investment Name";
}
export function investmentTypeLabel(subtype: string) {
  return ["etf", "uitf", "reit"].includes(subtype.toLowerCase()) ? subtype.toUpperCase() : subtype.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}
export function investmentQuoteIdentity(input: { symbol?: string | null; name: string; subtype?: string | null; currency: string }) {
  if (!["stock", "etf", "reit", "crypto"].includes(input.subtype ?? "")) return null;
  const inferred = investmentTickerMatches(input.name, input.subtype!, input.currency);
  const symbol = (input.symbol?.trim() || (inferred.length === 1 ? inferred[0].symbol : "")).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9.\-]{0,29}$/.test(symbol)) return null;
  const currency = input.currency.toUpperCase();
  // A selected share class must agree with an exact company identity.
  if (inferred.length && !inferred.some(item => item.symbol === symbol)) return null;
  const namedIdentity = inferred.find(item => item.symbol === symbol);
  const identified = SECURITIES.find(item => item.subtype === input.subtype && item.symbol === symbol &&
    (item.market === "crypto" || item.currency === currency));
  const market = namedIdentity?.market ?? identified?.market ?? (input.subtype === "crypto" ? "crypto" : currency === "PHP" ? "ph" : currency === "USD" ? "us" : null);
  if (!market) return null;
  return { symbol, market, currency };
}
export type InvestmentQuote = { symbol?: string; currency?: string; latest?: { value?: number; date?: string }; provider?: string };
/** Never relabel a foreign quote as the holding currency or use a stale/undated price. */
export function investmentValueFromQuote(quote: InvestmentQuote, quantity: string | number | null | undefined, currency: string, now = Date.now()) {
  const units = quantity == null || String(quantity).trim() === "" ? NaN : Number(quantity);
  const price = quote.latest?.value;
  const date = quote.latest?.date ? Date.parse(quote.latest.date) : NaN;
  if (!Number.isFinite(units) || units < 0 || typeof price !== "number" || !Number.isFinite(price) || price <= 0 ||
    quote.currency?.toUpperCase() !== currency.toUpperCase() || !Number.isFinite(date) || date > now + 86400000 || now - date > 7 * 86400000) return null;
  const value = units * price;
  return Number.isFinite(value) ? Math.round((value + Number.EPSILON) * 100) / 100 : null;
}
export function isInvalidManualAccountBalance(source: unknown, value: unknown) {
  if (source !== "manual" || value == null || (typeof value === "string" && value.trim() === "")) return false;
  return !["string", "number"].includes(typeof value) || !Number.isFinite(Number(value));
}
export function newManualAccountBalance(source: unknown, balance: string | null, purchaseValue: string | null = null) {
  return balance ?? (source === "manual" ? purchaseValue ?? "0" : null);
}

export function investmentTickerHint(name: string, subtype: string, currency: string, symbol: string) {
  const matches = investmentTickerMatches(name, subtype, currency);
  const match = matches.find(item => item.symbol === symbol);
  if (matches.length && !match) return `Ticker ${symbol} does not match ${name}. Check the name or ticker in More Details before calculating its market value.`;
  return match && match.currency !== currency.toUpperCase()
    ? `Ticker: ${symbol}. This asset is quoted in ${match.currency}. Select ${match.currency} to show its market value; Clover will not convert your purchase amount automatically.`
    : `Ticker: ${symbol}`;
}
