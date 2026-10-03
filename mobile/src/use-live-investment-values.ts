import { registerScreenRefresh } from "./screen-refresh";
import { usePathname, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { investmentQuoteIdentity, investmentValueFromQuote, type InvestmentQuote } from "../../shared/investment-entry";
import { useSession } from "./session";

type Position = { id: string; name: string; currency: string; subtype?: string | null; symbol?: string | null; quantity?: string | null };
const quotes = new Map<string, { quote: InvestmentQuote; expiresAt: number }>();
const pendingQuotes = new Map<string, Promise<InvestmentQuote>>();

/** Read-only estimates. Stored purchase values and statement evidence remain untouched. */
export function useLiveInvestmentValues(positions: Position[]) {
  const session = useSession();
  const screenPath = usePathname();
  const [revision, setRevision] = useState(0);
  useFocusEffect(useCallback(() => registerScreenRefresh(screenPath, async () => { quotes.clear(); setRevision(value => value + 1); }), [screenPath]));
  const [values, setValues] = useState<{ scope: string; values: Record<string, number> }>({ scope: "", values: {} });
  const eligible = positions.flatMap(position => {
    const identity = investmentQuoteIdentity(position);
    return identity && position.quantity != null && position.quantity.trim() !== "" && Number(position.quantity) >= 0
      ? [{ ...identity, id: position.id, quantity: position.quantity }] : [];
  }).slice(0, 60);
  const signature = JSON.stringify(eligible);
  const scope = `${session.profileId}:${signature}`;
  useEffect(() => {
    if (session.demo) return;
    let active = true;
    const rows = JSON.parse(signature) as typeof eligible;
    const next: Record<string, number> = {};
    let cursor = 0;
    const worker = async () => {
      while (cursor < rows.length && active) {
        const row = rows[cursor++];
        const key = `${row.market}:${row.symbol}`;
        try {
          const cached = quotes.get(key);
          let quote = cached && cached.expiresAt > Date.now() ? cached.quote : null;
          if (!quote) {
            let pending = pendingQuotes.get(key);
            if (!pending) {
              pending = session.request<InvestmentQuote>(`investment-quote?symbol=${encodeURIComponent(row.symbol)}&market=${row.market}`);
              pendingQuotes.set(key, pending);
              void pending.finally(() => pendingQuotes.delete(key)).catch(() => {});
            }
            quote = await pending;
            quotes.set(key, { quote, expiresAt: Date.now() + 15 * 60_000 });
          }
          const value = investmentValueFromQuote(quote, row.quantity, row.currency);
          if (value !== null) next[row.id] = value;
        } catch { /* The recorded purchase/statement value remains visible. */ }
      }
    };
    void Promise.all(Array.from({ length: Math.min(4, rows.length) }, worker)).then(() => {
      if (active) setValues({ scope, values: next });
    });
    return () => { active = false; };
  }, [scope, signature, session.demo, session.request, revision]);
  return values.scope === scope ? values.values : {};
}
