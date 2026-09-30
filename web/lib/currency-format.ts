import { getCurrencySymbol } from "@/lib/currencies";

const DEFAULT_LOCALE = "en-PH";

const normalizeCurrencyCode = (value?: string | null) => {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized || "PHP";
};

// Formatters contain no financial data. Bound the cache for caller-supplied locales.
const amountFormatters = new Map<string, Intl.NumberFormat>();
const getAmountFormatter = (locale: string, currency?: string) => {
  const key = `${locale}:${currency ?? "MIXED"}`;
  let formatter = amountFormatters.get(key);
  if (!formatter) {
    // Keep nonzero fractional Won visible (for example converted valuations).
    // This changes presentation only; stored amounts are never rounded here.
    formatter = new Intl.NumberFormat(locale, { minimumFractionDigits: currency === "KRW" ? 0 : 2, maximumFractionDigits: 2 });
    if (amountFormatters.size >= 16) amountFormatters.delete(amountFormatters.keys().next().value!);
    amountFormatters.set(key, formatter);
  }
  return formatter;
};

// Intl preserves decimal strings without first rounding them through a Number.
const formatPlainAmount = (value: number | string, locale = DEFAULT_LOCALE, currency?: string) =>
  getAmountFormatter(locale, currency).format(value as number);

const shouldUseSpacing = (symbol: string) => symbol.length > 2 && !symbol.endsWith("$");

export const makeCurrencyFormatter = (currency?: string | null, locale = DEFAULT_LOCALE) => {
  const normalized = normalizeCurrencyCode(currency);

  if (normalized === "MIXED") {
    return {
      format: (value: number | string) => formatPlainAmount(value, locale),
    };
  }

  const symbol = getCurrencySymbol(normalized);
  const spacer = shouldUseSpacing(symbol) ? " " : "";

  return {
    format: (value: number | string) => `${symbol}${spacer}${formatPlainAmount(value, locale, normalized)}`,
  };
};

export const formatCurrencyAmount = (value: number | string, currency?: string | null, locale = DEFAULT_LOCALE) =>
  makeCurrencyFormatter(currency, locale).format(value);

export const formatSignedCurrencyAmount = (value: number, currency?: string | null, locale = DEFAULT_LOCALE) =>
  `${value < 0 ? "-" : ""}${formatCurrencyAmount(Math.abs(value), currency, locale)}`;

export const formatCurrencyCode = (currency?: string | null) => normalizeCurrencyCode(currency);

export const formatCurrencySymbol = (currency?: string | null) => getCurrencySymbol(currency);
