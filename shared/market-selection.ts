export type MarketKey = "us" | "ph" | "crypto";
export type TickerSuggestion = {
  symbol: string;
  name: string;
  market: MarketKey;
  popularity: number;
};
export const MARKET_OPTIONS: Array<{ key: MarketKey; label: string; description: string }> = [
  { key: "us", label: "US", description: "United States" },
  { key: "ph", label: "PH", description: "Philippines" },
  { key: "crypto", label: "Crypto", description: "Digital assets" },
];

export const POPULAR_TICKERS: Record<MarketKey, TickerSuggestion[]> = {
  us: [
    { symbol: "AAPL", name: "Apple", market: "us", popularity: 100 },
    { symbol: "MSFT", name: "Microsoft", market: "us", popularity: 99 },
    { symbol: "NVDA", name: "NVIDIA", market: "us", popularity: 98 },
    { symbol: "AMZN", name: "Amazon", market: "us", popularity: 97 },
    { symbol: "GOOGL", name: "Alphabet", market: "us", popularity: 96 },
    { symbol: "SPY", name: "S&P 500 ETF", market: "us", popularity: 95 },
    { symbol: "QQQ", name: "Nasdaq 100 ETF", market: "us", popularity: 94 },
    { symbol: "TSLA", name: "Tesla", market: "us", popularity: 93 },
  ],
  ph: [
    { symbol: "BPI", name: "Bank of the Philippine Islands", market: "ph", popularity: 100 },
    { symbol: "BDO", name: "BDO Unibank", market: "ph", popularity: 99 },
    { symbol: "ALI", name: "Ayala Land", market: "ph", popularity: 98 },
    { symbol: "SM", name: "SM Investments", market: "ph", popularity: 97 },
    { symbol: "JFC", name: "Jollibee Foods", market: "ph", popularity: 96 },
    { symbol: "FMETF", name: "First Metro ETF", market: "ph", popularity: 95 },
    { symbol: "PSEI", name: "PSEi Index", market: "ph", popularity: 94 },
    { symbol: "ICT", name: "International Container Terminal", market: "ph", popularity: 93 },
  ],
  crypto: [
    { symbol: "BTC", name: "Bitcoin", market: "crypto", popularity: 100 },
    { symbol: "ETH", name: "Ethereum", market: "crypto", popularity: 99 },
    { symbol: "SOL", name: "Solana", market: "crypto", popularity: 98 },
    { symbol: "XRP", name: "XRP", market: "crypto", popularity: 97 },
    { symbol: "BNB", name: "BNB", market: "crypto", popularity: 96 },
    { symbol: "ADA", name: "Cardano", market: "crypto", popularity: 95 },
    { symbol: "DOGE", name: "Dogecoin", market: "crypto", popularity: 94 },
    { symbol: "TON", name: "Toncoin", market: "crypto", popularity: 93 },
  ],
};

export const marketIcon = { us: "🇺🇸", ph: "🇵🇭", crypto: "🪙" };
const colors = ["#009cad", "#8459bc", "#d17a13", "#3073c7", "#b94e79", "#33835b"];
export type SelectedTicker = { symbol: string; color: string };
export function toggleTicker(selection: SelectedTicker[], symbol: string): SelectedTicker[] {
  if (selection.some(s => s.symbol === symbol)) return selection.filter(s => s.symbol !== symbol);
  const used = new Set(selection.map(s => s.color));
  let index = 0;
  let color: string;
  do {
    color = colors[index] ?? `hsl(${(index * 137.5) % 360}, 55%, 40%)`;
    index++;
  } while (used.has(color));
  return [...selection, {symbol, color}];
}
