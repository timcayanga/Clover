"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCurrencyCode } from "@/lib/currency-format";
import { resolveGotradeSecuritySymbol } from "@/lib/gotrade-securities";
import { isMarketInvestmentSubtype, type InvestmentSubtype } from "@/lib/investments";

type InvestmentPosition = {
  id: string;
  name: string;
  institution?: string | null;
  currency: string;
  investmentSubtype?: InvestmentSubtype | null;
  investmentSymbol?: string | null;
  investmentQuantity?: string | null;
};

const symbolForPosition = (position: InvestmentPosition) =>
  resolveGotradeSecuritySymbol({
    institution: position.institution,
    name: position.name,
    symbol: position.investmentSymbol,
  });

type CachedValue = { value: number; expiresAt: number };
const valueCache = new Map<string, CachedValue>();
const LIVE_VALUE_TTL_MS = 15 * 60 * 1000;

const marketForPosition = (position: InvestmentPosition) => {
  if (position.investmentSubtype === "crypto") return "crypto";
  if (formatCurrencyCode(position.currency) === "PHP" || /gstocks|pse|philippine/i.test(position.institution ?? "")) {
    return "ph";
  }
  return "us";
};

export const useLiveInvestmentValues = (positions: InvestmentPosition[]) => {
  const eligible = useMemo(
    () =>
      positions.filter((position) => {
        const quantity = Number(position.investmentQuantity);
        return (
          isMarketInvestmentSubtype(position.investmentSubtype) &&
          Boolean(symbolForPosition(position)) &&
          Number.isFinite(quantity) &&
          quantity > 0
        );
      }),
    [positions]
  );
  const [values, setValues] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const next: Record<string, number> = {};
      await Promise.all(
        eligible.map(async (position) => {
          const symbol = symbolForPosition(position);
          if (!symbol) return;
          const quantity = Number(position.investmentQuantity);
          const market = marketForPosition(position);
          const key = `${market}:${symbol}:${formatCurrencyCode(position.currency)}:${quantity}`;
          const cached = valueCache.get(key);
          if (cached && cached.expiresAt > Date.now()) {
            next[position.id] = cached.value;
            return;
          }
          try {
            const response = await fetch(
              `/api/market-history?symbol=${encodeURIComponent(symbol)}&market=${market}&range=5D`
            );
            const payload = (await response.json().catch(() => null)) as {
              currency?: string;
              latest?: { value?: number };
            } | null;
            const unitPrice = Number(payload?.latest?.value);
            if (
              !response.ok ||
              !Number.isFinite(unitPrice) ||
              unitPrice <= 0 ||
              formatCurrencyCode(payload?.currency ?? position.currency) !== formatCurrencyCode(position.currency)
            ) {
              return;
            }
            const value = Number((unitPrice * quantity).toFixed(2));
            valueCache.set(key, { value, expiresAt: Date.now() + LIVE_VALUE_TTL_MS });
            next[position.id] = value;
          } catch {
            // Recorded values remain visible when a market provider is unavailable.
          }
        })
      );
      if (!cancelled && Object.keys(next).length > 0) {
        setValues((current) => ({ ...current, ...next }));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [eligible]);

  return values;
};
