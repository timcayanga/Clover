import { getCurrencySymbol } from "@/lib/currencies";

const DEFAULT_LOCALE = "en-PH";

const normalizeCurrencyCode = (value?: string | null) => {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized || "PHP";
};

const formatPlainAmount = (value: number, locale = DEFAULT_LOCALE) =>
  new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const shouldUseSpacing = (symbol: string) => symbol.length > 2 && !symbol.endsWith("$");

export const makeCurrencyFormatter = (currency?: string | null, locale = DEFAULT_LOCALE) => {
  const normalized = normalizeCurrencyCode(currency);

  if (normalized === "MIXED") {
    return {
      format: (value: number) => formatPlainAmount(value, locale),
    };
  }

  const symbol = getCurrencySymbol(normalized);
  const spacer = shouldUseSpacing(symbol) ? " " : "";

  return {
    format: (value: number) => `${symbol}${spacer}${formatPlainAmount(value, locale)}`,
  };
};

export const formatCurrencyAmount = (value: number, currency?: string | null, locale = DEFAULT_LOCALE) =>
  makeCurrencyFormatter(currency, locale).format(value);

export const formatSignedCurrencyAmount = (value: number, currency?: string | null, locale = DEFAULT_LOCALE) =>
  `${value < 0 ? "-" : ""}${formatCurrencyAmount(Math.abs(value), currency, locale)}`;

export const formatCurrencyCode = (currency?: string | null) => normalizeCurrencyCode(currency);

export const formatCurrencySymbol = (currency?: string | null) => getCurrencySymbol(currency);
