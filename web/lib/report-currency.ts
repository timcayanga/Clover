import { formatCurrencyCode } from "@/lib/currency-format";
import { normalizeDefaultCurrency } from "@/lib/regional-preferences";

/** Reports use only currencies present in the active Profile. */
export function resolveReportCurrency(accountCurrencies: string[], preferredCurrency: string, requested?: string) {
  const preferred = normalizeDefaultCurrency(preferredCurrency);
  const currencies = [...new Set(accountCurrencies.map(formatCurrencyCode).filter(code => /^[A-Z]{3}$/.test(code)))].sort();
  if (!currencies.length) currencies.push(preferred);
  const defaultCurrency = currencies.includes(preferred) ? preferred : currencies[0];
  const normalized = requested?.trim().toUpperCase();
  const currentCurrency = normalized === "ALL" ? "ALL" : normalized && currencies.includes(normalized) ? normalized : defaultCurrency;
  return { currencies, defaultCurrency, currentCurrency };
}
