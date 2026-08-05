"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCurrencyCode } from "@/lib/currency-format";

type ExchangeRate = { rate: number; date: string | null };
const rateCache = new Map<string, ExchangeRate>();

const rateKey = (base: string, quote: string) => `${base}:${quote}`;

const loadRate = async (base: string, quote: string) => {
  if (base === quote) {
    return { rate: 1, date: null };
  }

  const key = rateKey(base, quote);
  const cached = rateCache.get(key);
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

  const result = { rate: payload.rate, date: payload.date ?? null };
  rateCache.set(key, result);
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
    setState((current) => ({ ...current, loading: true, unavailable: [] }));
    void Promise.allSettled(sources.map(async (source) => ({ source, ...(await loadRate(source, target)) }))).then((results) => {
      if (cancelled) {
        return;
      }

      const rates: Record<string, number> = { [target]: 1 };
      const unavailable: string[] = [];
      let asOf: string | null = null;
      results.forEach((result, index) => {
        const source = sources[index];
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

