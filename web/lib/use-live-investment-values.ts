"use client";
import { investmentQuoteIdentity, investmentValueFromQuote, type InvestmentQuote } from "../../shared/investment-entry";
import { registerPullRefresh } from "./pull-refresh";

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

const symbolForPosition = (position: InvestmentPosition) => {
  const symbol = resolveGotradeSecuritySymbol({ institution: position.institution, name: position.name, symbol: position.investmentSymbol });
  if (["stock", "etf", "reit", "crypto"].includes(position.investmentSubtype ?? "")) {
    return investmentQuoteIdentity({ name: position.name, symbol, subtype: position.investmentSubtype, currency: position.currency })?.symbol ?? null;
  }
  return symbol;
};

type CachedValue = { value: number; expiresAt: number };
const valueCache = new Map<string, CachedValue>();
const LIVE_VALUE_TTL_MS = 15 * 60 * 1000;

const marketForPosition = (position: InvestmentPosition) => {
  const identity = investmentQuoteIdentity({ name: position.name, symbol: position.investmentSymbol, subtype: position.investmentSubtype, currency: position.currency });
  if (identity) return identity.market;
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
  const signature = JSON.stringify(eligible.map(position => ({ id: position.id, symbol: symbolForPosition(position), market: marketForPosition(position), quantity: Number(position.investmentQuantity), currency: position.currency })));
  const [values, setValues] = useState<{ signature: string; entries: Record<string, number> }>({ signature: "", entries: {} });

  useEffect(() => {
    let cancelled = false;
    const rows = JSON.parse(signature) as Array<{ id: string; symbol: string; market: string; quantity: number; currency: string }>;
    const load = async () => {
      const next: Record<string, number> = {};
      await Promise.all(
        rows.map(async (position) => {
          const symbol = position.symbol;
          if (!symbol) return;
          const quantity = position.quantity;
          const market = position.market;
          const key = `${market}:${symbol}:${formatCurrencyCode(position.currency)}:${quantity}`;
          const cached = valueCache.get(key);
          if (cached && cached.expiresAt > Date.now()) {
            next[position.id] = cached.value;
            return;
          }
          try {
            const response = await fetch(
              `/api/investment-quote?symbol=${encodeURIComponent(symbol)}&market=${market}`
            );
            const payload = (await response.json().catch(() => null)) as InvestmentQuote | null;
            const value = payload && response.ok ? investmentValueFromQuote(payload, quantity, position.currency) : null;
            if (value === null) return;
            valueCache.set(key, { value, expiresAt: Date.now() + LIVE_VALUE_TTL_MS });
            next[position.id] = value;
          } catch {
            // Recorded values remain visible when a market provider is unavailable.
          }
        })
      );
      if (!cancelled) setValues({ signature, entries: next });
    };
    void load();
    const unregister = registerPullRefresh(async () => { valueCache.clear(); await load(); });
    return () => {
      unregister(); cancelled = true;
    };
  }, [signature]);

  return values.signature === signature ? values.entries : {};
};
