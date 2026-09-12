"use client";
import { useEffect, useState } from "react";
type News = {
  id: string;
  title: string;
  summary: string;
  source: string;
  publishedAt: string | null;
};
const cache = new Map<string, { expires: number; items: News[] }>();
export function MarketAssetNews({
  symbol,
  market,
}: {
  symbol: string;
  market: string;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<News[] | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    setOpen(false);
    setItems(null);
    setError("");
  }, [symbol, market]);
  useEffect(() => {
    if (!open || !symbol) return;
    const key = `${market}:${symbol}`;
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) {
      setItems(cached.items);
      return;
    }
    const controller = new AbortController();
    setItems(null);
    setError("");
    void fetch(`/api/market-news?${new URLSearchParams({ symbol, market })}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "News unavailable.");
        if (!controller.signal.aborted) {
          if (cache.size >= 40) cache.delete(cache.keys().next().value!);
          cache.set(key, { expires: Date.now() + 900000, items: data.items });
          setItems(data.items);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [open, symbol, market, revision]);
  return (
    <section className="market-asset-news" aria-label="Asset news">
      <h3>{symbol ? `${symbol} news` : "Asset news"}</h3>
      {!symbol ? (
        <p>Choose an asset to view coverage.</p>
      ) : !open ? (
        <button
          className="button plan-action-view"
          onClick={() => setOpen(true)}
        >
          Load recent news
        </button>
      ) : error ? (
        <p role="status">
          {error}{" "}
          <button
            className="button button-secondary"
            onClick={() => setRevision((v) => v + 1)}
          >
            Try again
          </button>
        </p>
      ) : !items ? (
        <p role="status">Loading news…</p>
      ) : items.length ? (
        <div>
          {items.slice(0, 3).map((item) => (
            <article key={item.id}>
              <h4>{item.title}</h4>
              <p>{item.summary}</p>
              <small>
                {item.source}
                {item.publishedAt
                  ? ` · ${new Date(item.publishedAt).toLocaleDateString()}`
                  : ""}
              </small>
            </article>
          ))}
        </div>
      ) : (
        <p>No recent coverage is available for this asset.</p>
      )}
      <small>
        News provider: Alpha Vantage. Loaded on request and cached for 15
        minutes.
      </small>
    </section>
  );
}
