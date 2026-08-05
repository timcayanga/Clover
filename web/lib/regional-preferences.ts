import { formatCurrencyCode } from "@/lib/currency-format";

export const regionalPreferencesStorageKey = "clover.settings.regional.v1";
export const defaultCurrencyChangedEventName = "clover:default-currency-changed";
export const defaultCurrencyCookieKey = "clover.default-currency.v1";
export const fallbackDefaultCurrency = "PHP";

type StoredRegionalPreferences = {
  baseCurrency?: string;
  [key: string]: unknown;
};

export const normalizeDefaultCurrency = (value: unknown) => {
  const currency = formatCurrencyCode(typeof value === "string" ? value : "");
  return /^[A-Z]{3}$/.test(currency) ? currency : fallbackDefaultCurrency;
};

export const readDefaultCurrency = () => {
  if (typeof window === "undefined") {
    return fallbackDefaultCurrency;
  }

  try {
    const stored = JSON.parse(window.localStorage.getItem(regionalPreferencesStorageKey) ?? "{}") as StoredRegionalPreferences;
    return normalizeDefaultCurrency(stored?.baseCurrency);
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
