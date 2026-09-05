"use client";

import { useEffect, useRef, useState } from "react";
import { buildMarketLinePath, filterMarketHistoryByRange, type MarketHistoryPoint, type MarketRegion } from "@/lib/market-data";

const cache = new Map<string, { expires: number; result: Promise<MarketHistoryPoint[]> }>();
let running = 0;
const queue: Array<() => void> = [];
async function loadHistory(symbol: string, market: MarketRegion) {
  const key = `${market}:${symbol}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.result;
  const result = (async () => {
    if (running >= 3) await new Promise<void>((resolve) => queue.push(resolve));
    else running += 1;
    try {
      const response = await fetch(`/api/market-history?symbol=${encodeURIComponent(symbol)}&market=${market}&range=1Y`, { signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error("History unavailable");
      const data = await response.json() as { points?: MarketHistoryPoint[] };
      return filterMarketHistoryByRange((data.points ?? []).filter((p) => Number.isFinite(p.value) && p.value >= 0 && Number.isFinite(Date.parse(p.date))).sort((a, b) => Date.parse(a.date) - Date.parse(b.date)), "1Y");
    } catch { return []; }
    finally {
      const next = queue.shift();
      if (next) next();
      else running -= 1;
    }
  })();
  if (cache.size >= 100) cache.delete(cache.keys().next().value!);
  cache.set(key, { expires: Date.now() + 600000, result });
  return result;
}

export function InvestmentSparkline({ symbol, market, name }: { symbol: string; market: MarketRegion; name: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [points, setPoints] = useState<MarketHistoryPoint[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    let observer: IntersectionObserver | undefined;
    const desktop = window.matchMedia("(min-width: 1101px)");
    const observe = () => {
      observer?.disconnect();
      if (!desktop.matches || !ref.current) return;
      observer = new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting) return;
        observer?.disconnect();
        void loadHistory(symbol, market).then((result) => { if (!cancelled) setPoints(result); });
      }, { rootMargin: "80px" });
      observer.observe(ref.current);
    };
    setPoints(null);
    observe();
    desktop.addEventListener("change", observe);
    return () => { cancelled = true; observer?.disconnect(); desktop.removeEventListener("change", observe); };
  }, [symbol, market]);
  const usable = points && points.length > 1;
  const change = usable ? points.at(-1)!.value - points[0].value : 0;
  const direction = change > 0 ? "up" : change < 0 ? "down" : "flat";
  const chart = usable ? buildMarketLinePath(points, 112, 30, 3) : null;
  return <span ref={ref} className={`investment-sparkline investment-sparkline--${direction}`}>
    {chart ? <svg viewBox="0 0 112 30" role="img" aria-label={`${name}: past year market price, ${direction}`}>
      <title>{name}: available market prices over the past year ({direction})</title>
      <path d={chart.linePath} fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg> : <small>{points === null ? "Loading 1Y…" : "1Y history unavailable"}</small>}
  </span>;
}
