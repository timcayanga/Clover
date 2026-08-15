import { formatCurrencyCode } from "@/lib/currency-format";

export const regionalPreferencesStorageKey = "clover.settings.regional.v1";
export const defaultCurrencyChangedEventName = "clover:default-currency-changed";
export const defaultCurrencyCookieKey = "clover.default-currency.v1";
export const fallbackDefaultCurrency = "PHP";

export type RegionalDateFormat = "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD";
export type RegionalNumberFormat = "1,234.56" | "1.234,56";

export type RegionalPreferences = {
  baseCurrency: string;
  dateFormat: RegionalDateFormat;
  numberFormat: RegionalNumberFormat;
  timeZone: string;
  locale: string;
  countryCode: string | null;
  detectionSource?: "geo" | "locale" | "fallback" | "manual";
};

export const fallbackRegionalPreferences: RegionalPreferences = {
  baseCurrency: fallbackDefaultCurrency,
  dateFormat: "MM/DD/YYYY",
  numberFormat: "1,234.56",
  timeZone: "Asia/Manila",
  locale: "en-PH",
  countryCode: "PH",
  detectionSource: "fallback",
};

export const normalizeDefaultCurrency = (value: unknown) => {
  const currency = formatCurrencyCode(typeof value === "string" ? value : "");
  return /^[A-Z]{3}$/.test(currency) ? currency : fallbackDefaultCurrency;
};

const normalizeCountryCode = (value: unknown) => {
  const countryCode = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z]{2}$/.test(countryCode) ? countryCode : null;
};

export const normalizeRegionalPreferences = (
  value: unknown,
  fallback: RegionalPreferences = fallbackRegionalPreferences
): RegionalPreferences => {
  const candidate = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const dateFormat = ["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"].includes(String(candidate.dateFormat))
    ? (candidate.dateFormat as RegionalDateFormat)
    : fallback.dateFormat;
  const numberFormat = ["1,234.56", "1.234,56"].includes(String(candidate.numberFormat))
    ? (candidate.numberFormat as RegionalNumberFormat)
    : fallback.numberFormat;
  const timeZone = typeof candidate.timeZone === "string" && candidate.timeZone.trim()
    ? candidate.timeZone.trim()
    : fallback.timeZone;
  const locale = typeof candidate.locale === "string" && candidate.locale.trim()
    ? candidate.locale.trim()
    : fallback.locale;
  const source = ["geo", "locale", "fallback", "manual"].includes(String(candidate.detectionSource))
    ? (candidate.detectionSource as RegionalPreferences["detectionSource"])
    : fallback.detectionSource;

  return {
    baseCurrency: normalizeDefaultCurrency(candidate.baseCurrency ?? fallback.baseCurrency),
    dateFormat,
    numberFormat,
    timeZone,
    locale,
    countryCode:
      candidate.countryCode === null
        ? null
        : normalizeCountryCode(candidate.countryCode) ?? fallback.countryCode,
    detectionSource: source,
  };
};

export const readRegionalPreferences = () => {
  if (typeof window === "undefined") {
    return fallbackRegionalPreferences;
  }

  try {
    return normalizeRegionalPreferences(
      JSON.parse(window.localStorage.getItem(regionalPreferencesStorageKey) ?? "{}")
    );
  } catch {
    return fallbackRegionalPreferences;
  }
};

export const persistRegionalPreferences = (preferences: RegionalPreferences) => {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = normalizeRegionalPreferences(preferences);
  try {
    window.localStorage.setItem(regionalPreferencesStorageKey, JSON.stringify(normalized));
  } catch {
    // The cookie still keeps the default currency usable when browser storage is unavailable.
  }
  notifyDefaultCurrencyChanged(normalized.baseCurrency);
};

export const readDefaultCurrency = () => {
  if (typeof window === "undefined") {
    return fallbackDefaultCurrency;
  }

  try {
    return readRegionalPreferences().baseCurrency;
  } catch {
    return fallbackDefaultCurrency;
  }
};

export const notifyDefaultCurrencyChanged = (currency: string) => {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedCurrency = normalizeDefaultCurrency(currency);
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${defaultCurrencyCookieKey}=${normalizedCurrency}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  window.dispatchEvent(
    new CustomEvent(defaultCurrencyChangedEventName, {
      detail: { currency: normalizedCurrency },
    })
  );
};
