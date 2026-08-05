"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCurrencyCode } from "@/lib/currency-format";

type ExchangeRate = { rate: number; date: string | null };
type CachedExchangeRate = ExchangeRate & { cachedAt: number };

const rateCache = new Map<string, CachedExchangeRate>();
const rateCacheStorageKey = "clover.exchange-rates.v1";
const rateCacheMaxAgeMs = 12 * 60 * 60 * 1000;

const rateKey = (base: string, quote: string) => `${base}:${quote}`;

const isFreshRate = (value: unknown): value is CachedExchangeRate => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CachedExchangeRate>;
  return (
    typeof candidate.rate === "number" &&
    Number.isFinite(candidate.rate) &&
    typeof candidate.cachedAt === "number" &&
    Date.now() - candidate.cachedAt < rateCacheMaxAgeMs
  );
};

const readStoredRate = (key: string) => {
  if (typeof window === "undefined") return null;
  try {
    const stored = JSON.parse(window.localStorage.getItem(rateCacheStorageKey) ?? "{}") as Record<string, unknown>;
    return isFreshRate(stored[key]) ? stored[key] : null;
  } catch {
    return null;
  }
};

const getCachedRate = (base: string, quote: string) => {
  if (base === quote) return { rate: 1, date: null, cachedAt: Date.now() };
  const key = rateKey(base, quote);
  const memoryRate = rateCache.get(key);
  if (memoryRate && isFreshRate(memoryRate)) return memoryRate;
  const storedRate = readStoredRate(key);
  if (storedRate) rateCache.set(key, storedRate);
  return storedRate;
};

const storeRate = (key: string, value: CachedExchangeRate) => {
  rateCache.set(key, value);
  if (typeof window === "undefined") return;
  try {
    const stored = JSON.parse(window.localStorage.getItem(rateCacheStorageKey) ?? "{}") as Record<string, unknown>;
    const freshEntries = Object.fromEntries(Object.entries(stored).filter(([, rate]) => isFreshRate(rate)));
    window.localStorage.setItem(rateCacheStorageKey, JSON.stringify({ ...freshEntries, [key]: value }));
  } catch {
    // FX values are an optional speed cache; memory caching remains available if storage is unavailable.
  }
};

const loadRate = async (base: string, quote: string) => {
  if (base === quote) {
    return { rate: 1, date: null };
  }

  const key = rateKey(base, quote);
  const cached = getCachedRate(base, quote);
  if (cached) {
    return cached;
  }

  const response = await fetch(`/api/fx-rate?base=${encodeURIComponent(base)}&quote=${encodeURIComponent(quote)}`);
  if (!response.ok) {
    throw new Error(`No exchange rate is available for ${base}/${quote}.`);
  }

  const payload = (await response.json()) as { rate?: number; date?: string };
  if (typeof payload.rate !== "number" || !Number.isFinite(payload.rate)) {
    throw new Error(`Invalid exchange rate for ${base}/${quote}.`);
  }

  const result = { rate: payload.rate, date: payload.date ?? null, cachedAt: Date.now() };
  storeRate(key, result);
  return result;
};

export const useExchangeRates = (sourceCurrencies: string[], targetCurrency: string, enabled = true) => {
  const target = formatCurrencyCode(targetCurrency);
  const sources = useMemo(
    () => Array.from(new Set(sourceCurrencies.map(formatCurrencyCode).filter(Boolean))).sort(),
    [sourceCurrencies.join("|")]
  );
  const sourceKey = sources.join("|");
  const [state, setState] = useState<{ rates: Record<string, number>; loading: boolean; unavailable: string[]; asOf: string | null }>(() => ({
    rates: target ? { [target]: 1 } : {},
    loading: false,
    unavailable: [],
    asOf: null,
  }));

  useEffect(() => {
    if (!enabled || !target || sources.length === 0) {
      setState({ rates: target ? { [target]: 1 } : {}, loading: false, unavailable: [], asOf: null });
      return;
    }

    let cancelled = false;
    const cachedRates: Record<string, number> = { [target]: 1 };
    let cachedAsOf: string | null = null;
    const missingSources = sources.filter((source) => {
      const cached = getCachedRate(source, target);
      if (!cached) return true;
      cachedRates[source] = cached.rate;
      if (cached.date && (!cachedAsOf || cached.date > cachedAsOf)) cachedAsOf = cached.date;
      return false;
    });

    setState({ rates: cachedRates, loading: missingSources.length > 0, unavailable: [], asOf: cachedAsOf });
    if (missingSources.length === 0) return;

    void Promise.allSettled(missingSources.map(async (source) => ({ source, ...(await loadRate(source, target)) }))).then((results) => {
      if (cancelled) {
        return;
      }

      const rates: Record<string, number> = { ...cachedRates };
      const unavailable: string[] = [];
      let asOf: string | null = null;
      results.forEach((result, index) => {
        const source = missingSources[index];
        if (result.status === "fulfilled") {
          rates[source] = result.value.rate;
          if (result.value.date && (!asOf || result.value.date > asOf)) {
            asOf = result.value.date;
          }
        } else {
          unavailable.push(source);
        }
      });
      setState({ rates, loading: false, unavailable, asOf });
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, sourceKey, target]);

  return state;
};

export const convertAmount = (amount: number, currency: string, rates: Record<string, number>) => {
  const rate = rates[formatCurrencyCode(currency)];
  return typeof rate === "number" && Number.isFinite(rate) ? amount * rate : null;
};
