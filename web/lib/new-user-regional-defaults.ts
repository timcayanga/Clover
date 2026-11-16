import { getRegionalParsingProfile } from "@/lib/context-corpus";
import {
  fallbackRegionalPreferences,
  type RegionalDateFormat,
  type RegionalNumberFormat,
  type RegionalPreferences,
} from "@/lib/regional-preferences";

type NewUserRegionalSignals = {
  countryCode?: string | null;
  acceptLanguage?: string | null;
};

const normalizeCountryCode = (value: string | null | undefined) => {
  const countryCode = value?.trim().toUpperCase() ?? "";
  return /^[A-Z]{2}$/.test(countryCode) ? countryCode : null;
};

const readPreferredLocale = (acceptLanguage: string | null | undefined) =>
  acceptLanguage?.split(",")[0]?.split(";")[0]?.trim() || null;

const readLocaleCountry = (locale: string | null) => {
  if (!locale) {
    return null;
  }

  const region = locale
    .split("-")
    .slice(1)
    .reverse()
    .find((part) => /^[A-Za-z]{2}$/.test(part));
  return normalizeCountryCode(region);
};

const dateFormatForOrder = (dateOrder: string): RegionalDateFormat => {
  if (dateOrder === "dmy") {
    return "DD/MM/YYYY";
  }
  if (dateOrder === "ymd") {
    return "YYYY-MM-DD";
  }
  return "MM/DD/YYYY";
};

const numberFormatForSeparator = (decimalSeparator: string | null): RegionalNumberFormat =>
  decimalSeparator === "," ? "1.234,56" : "1,234.56";

export const resolveNewUserRegionalDefaults = ({
  countryCode,
  acceptLanguage,
}: NewUserRegionalSignals): RegionalPreferences => {
  const preferredLocale = readPreferredLocale(acceptLanguage);
  const geoCountry = normalizeCountryCode(countryCode);
  const localeCountry = readLocaleCountry(preferredLocale);
  const resolvedCountry = geoCountry ?? localeCountry;
  const profile = getRegionalParsingProfile(resolvedCountry);

  if (!profile) {
    return {
      ...fallbackRegionalPreferences,
      locale: preferredLocale ?? fallbackRegionalPreferences.locale,
      detectionSource: "fallback",
    };
  }

  return {
    baseCurrency: profile.defaultCurrency,
    dateFormat: dateFormatForOrder(profile.dateOrder),
    numberFormat: numberFormatForSeparator(profile.decimalSeparator),
    timeZone: "UTC",
    locale: preferredLocale ?? profile.primaryLocale,
    countryCode: profile.countryCode,
    detectionSource: geoCountry ? "geo" : "locale",
  };
};
