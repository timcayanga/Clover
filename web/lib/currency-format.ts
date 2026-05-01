const DEFAULT_LOCALE = "en-PH";

const normalizeCurrencyCode = (value?: string | null) => {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized || "PHP";
};

const isLikelyIsoCurrency = (currency: string) => /^[A-Z]{3}$/.test(currency) && !["BTC", "ETH", "USDT", "USDC", "SOL", "XRP", "ADA", "BNB", "DOGE", "MIXED"].includes(currency);

const formatPlainAmount = (value: number, locale = DEFAULT_LOCALE) =>
  new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

export const makeCurrencyFormatter = (currency?: string | null, locale = DEFAULT_LOCALE) => {
  const normalized = normalizeCurrencyCode(currency);

  if (normalized === "MIXED" || !isLikelyIsoCurrency(normalized)) {
    return {
      format: (value: number) => (normalized === "MIXED" ? formatPlainAmount(value, locale) : `${formatPlainAmount(value, locale)} ${normalized}`),
    };
  }

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: normalized,
      minimumFractionDigits: 2,
    });
  } catch {
    return {
      format: (value: number) => `${formatPlainAmount(value, locale)} ${normalized}`,
    };
  }
};

export const formatCurrencyAmount = (value: number, currency?: string | null, locale = DEFAULT_LOCALE) =>
  makeCurrencyFormatter(currency, locale).format(value);

export const formatSignedCurrencyAmount = (value: number, currency?: string | null, locale = DEFAULT_LOCALE) =>
  `${value < 0 ? "-" : ""}${formatCurrencyAmount(Math.abs(value), currency, locale)}`;

export const formatCurrencyCode = (currency?: string | null) => normalizeCurrencyCode(currency);
