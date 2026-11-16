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
