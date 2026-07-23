const CRYPTO_QUOTE_TTL_MS = 60_000;
const QUOTE_TIMEOUT_MS = 1_500;

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }>;
  };
};

type CachedQuote = { price: number; expiresAt: number };

const quoteCache = new Map<string, CachedQuote>();

const COINGECKO_ID_BY_SYMBOL: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  XRP: "ripple",
  SOL: "solana",
  USDT: "tether",
  USDC: "usd-coin",
};

const toPhpPair = (symbol: string) => `${symbol.trim().toUpperCase()}-PHP`;

const readLatestClose = (payload: YahooChartResponse) => {
  const closes = payload.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
  for (let index = closes.length - 1; index >= 0; index -= 1) {
    const value = closes[index];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return null;
};

/**
 * Small, bounded spot-price lookup for imported crypto units. The importer
 * keeps the statement value as raw evidence, but the current account value is
 * derived from quantity × a live PHP quote whenever one is available.
 */
export const getLiveCryptoPhpPrices = async (symbols: string[]) => {
  const uniqueSymbols = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
  const now = Date.now();
  const prices: Record<string, number> = {};
  const missingSymbols: string[] = [];

  for (const symbol of uniqueSymbols) {
    const cached = quoteCache.get(symbol);
    if (cached && cached.expiresAt > now) {
      prices[symbol] = cached.price;
    } else {
      missingSymbols.push(symbol);
    }
  }

  const coinGeckoSymbols = missingSymbols.filter((symbol) => Boolean(COINGECKO_ID_BY_SYMBOL[symbol]));
  if (coinGeckoSymbols.length > 0) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), QUOTE_TIMEOUT_MS);
    try {
      const ids = coinGeckoSymbols.map((symbol) => COINGECKO_ID_BY_SYMBOL[symbol]).join(",");
      const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=php`, {
        cache: "no-store",
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      if (response.ok) {
        const payload = (await response.json()) as Record<string, { php?: number }>;
        for (const symbol of coinGeckoSymbols) {
          const price = payload[COINGECKO_ID_BY_SYMBOL[symbol]]?.php;
          if (typeof price === "number" && Number.isFinite(price) && price > 0) {
            quoteCache.set(symbol, { price, expiresAt: Date.now() + CRYPTO_QUOTE_TTL_MS });
            prices[symbol] = price;
          }
        }
      }
    } catch {
      // Yahoo Finance below remains a secondary source for supported pairs.
    } finally {
      clearTimeout(timeout);
    }
  }

  const yahooFallbackSymbols = missingSymbols.filter((symbol) => !prices[symbol]);
  await Promise.all(
    yahooFallbackSymbols.map(async (symbol) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), QUOTE_TIMEOUT_MS);
      try {
        const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(toPhpPair(symbol))}?range=1d&interval=1m`, {
          cache: "no-store",
          headers: { accept: "application/json,text/plain,*/*" },
          signal: controller.signal,
        });
        if (!response.ok) {
          return;
        }
        const price = readLatestClose((await response.json()) as YahooChartResponse);
        if (price === null) {
          return;
        }
        quoteCache.set(symbol, { price, expiresAt: Date.now() + CRYPTO_QUOTE_TTL_MS });
        prices[symbol] = price;
      } catch {
        // A live quote must never delay or fail an import. The importer retains
        // the visible per-asset valuation as auditable fallback evidence.
      } finally {
        clearTimeout(timeout);
      }
    })
  );

  return prices;
};
