import { useEffect, useState } from "react";
import { useSession } from "./session";
type Quote = {
  base: string;
  quote: string;
  rate: number;
  date: string;
  at: number;
};
const cache = new Map<string, Quote>();
const maxAge = 6 * 60 * 60 * 1000;
export function useExchangeRates(
  sources: string[],
  target: string,
  enabled: boolean,
) {
  const session = useSession();
  const key = [...new Set(sources.filter((s) => s !== target))]
    .sort()
    .join(",");
  const scope = `${enabled}:${target}:${key}`;
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState({
    scope: "",
    rates: {} as Record<string, number>,
    loading: false,
    asOf: null as string | null,
  });
  useEffect(() => {
    let active = true;
    const rates: Record<string, number> = { [target]: 1 };
    const dates: string[] = [];
    const missing: string[] = [];
    for (const source of enabled && key ? key.split(",") : []) {
      const quote = cache.get(`${source}:${target}`);
      if (quote && Date.now() - quote.at < maxAge) {
        rates[source] = quote.rate;
        dates.push(quote.date);
      } else missing.push(source);
    }
    setState({
      scope,
      rates,
      loading: missing.length > 0,
      asOf: dates.sort()[0] ?? null,
    });
    if (!missing.length) return;
    let index = 0;
    async function worker() {
      while (active && index < missing.length) {
        const source = missing[index++];
        try {
          const quote = await session.request<Quote>(
            `fx-rate?base=${encodeURIComponent(source)}&quote=${encodeURIComponent(target)}`,
          );
          if (
            quote.base !== source ||
            quote.quote !== target ||
            !Number.isFinite(quote.rate) ||
            quote.rate <= 0
          )
            continue;
          cache.set(`${source}:${target}`, { ...quote, at: Date.now() });
          rates[source] = quote.rate;
          if (quote.date) dates.push(quote.date);
        } catch {
          /* Missing quotes remain unavailable, never substitute a 1:1 rate. */
        }
      }
    }
    void Promise.all(
      Array.from({ length: Math.min(4, missing.length) }, worker),
    ).then(() => {
      if (active)
        setState({
          scope,
          rates: { ...rates },
          loading: false,
          asOf: dates.sort()[0] ?? null,
        });
    });
    return () => {
      active = false;
    };
  }, [scope, retry, session.request]);
  const current =
    state.scope === scope
      ? state
      : { rates: { [target]: 1 }, loading: enabled, asOf: null };
  return { ...current, retry: () => setRetry((n) => n + 1) };
}
