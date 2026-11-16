import symbols from "./generated/investment-logo-symbols.json";
import { investmentTickerMatches } from "./investment-security-identities";

type AssetIdentity = { symbol?: string | null; name?: string | null; subtype?: string | null; currency?: string | null; market?: string | null };
const catalogs = Object.fromEntries(Object.entries(symbols).map(([market, values]) => [market, new Set<string>(values)]));
const markets: Record<string, string> = { PSE: "philippines", NASDAQ: "us", NYSE: "us", AMEX: "us", TYO: "japan", JPX: "japan", INDEX: "indices" };

/** Artwork identifies the held asset, never its broker. No fuzzy name matching. */
export function matchInvestmentLogo(input: AssetIdentity): string | null {
  if (!["stock", "crypto", "etf", "reit"].includes(input.subtype ?? "") && !input.symbol?.startsWith("^")) return null;
  const named = investmentTickerMatches(input.name ?? "", input.subtype!, "");
  const identity = named.length === 1 ? named[0] : null;
  let symbol = input.symbol?.trim().toUpperCase() || identity?.symbol || "";
  let market = input.market === "ph" ? "philippines" : input.market ?? null;
  const prefix = symbol.match(/^(PSE|NASDAQ|NYSE|AMEX|TYO|JPX|INDEX):(.+)$/);
  const qualifiedMarket = prefix ? markets[prefix[1]] : symbol.endsWith(".PS") ? "philippines" : symbol.endsWith(".T") ? "japan" : null;
  if (market && qualifiedMarket && market !== qualifiedMarket) return null;
  market ??= qualifiedMarket;
  symbol = prefix ? prefix[2] : symbol.replace(/\.(PS|T)$/, "");
  if (symbol.startsWith("^")) { market ??= "indices"; symbol = symbol.slice(1); }
  if (identity) {
    const namedMarket = identity.market === "ph" ? "philippines" : identity.market;
    if (symbol !== identity.symbol || market && market !== namedMarket) return null;
    market ??= namedMarket;
  }
  if (input.subtype === "crypto") {
    if (market && market !== "crypto") return null;
    market = "crypto";
    symbol = ({ BITCOIN: "BTC", ETHEREUM: "ETH", SOLANA: "SOL", RIPPLE: "XRP", DOGECOIN: "DOGE" } as Record<string, string>)[symbol] ?? symbol;
    if (!catalogs.crypto.has(symbol)) symbol = symbol.replace(/[-/](USD|USDT|PHP)$/, "");
  } else if (market === "crypto") return null;
  if (!market && ["GOOGL", "BRK.B", "BRK-B", "BRK-A"].includes(symbol) && (!input.currency || input.currency.toUpperCase() === "USD")) market = "us";
  if (market === "us" && symbol === "GOOGL") symbol = "GOOG";
  if (market === "us" && ["BRK.B", "BRK-B", "BRK-A"].includes(symbol)) symbol = "BRK.A";
  // Unqualified symbols shared by different exchanges remain ambiguous.
  const candidates = Object.keys(catalogs).filter(key => (input.subtype === "crypto" ? key === "crypto" : key !== "crypto") && catalogs[key].has(symbol));
  if (!market && candidates.length === 1) market = candidates[0];
  const currencyMarkets: Record<string, string> = { PHP: "philippines", USD: "us", JPY: "japan" };
  if (!qualifiedMarket && !input.market && !identity && input.subtype !== "crypto" && input.currency
    && currencyMarkets[input.currency.toUpperCase()] && market !== "indices"
    && market !== currencyMarkets[input.currency.toUpperCase()]) return null;
  if (!market || !catalogs[market]?.has(symbol)) return null;
  return `/assets/investments/${market}/${encodeURIComponent(symbol)}.svg`;
}
