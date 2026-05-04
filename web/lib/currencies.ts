const DEFAULT_LOCALE = "en";

export type CurrencyKind = "fiat";

export type CurrencyCatalogOption = {
  code: string;
  symbol: string;
  name: string;
  kind: CurrencyKind;
};

type CurrencyDefinition = CurrencyCatalogOption & {
  suggested?: boolean;
};

const CURRENCY_DEFINITIONS: CurrencyDefinition[] = [
  { code: "PHP", symbol: "₱", name: "Philippine Peso", kind: "fiat", suggested: true },
  { code: "USD", symbol: "$", name: "US Dollar", kind: "fiat", suggested: true },
  { code: "EUR", symbol: "€", name: "Euro", kind: "fiat", suggested: true },
  { code: "GBP", symbol: "£", name: "British Pound", kind: "fiat", suggested: true },
  { code: "JPY", symbol: "¥", name: "Japanese Yen", kind: "fiat", suggested: true },
  { code: "AUD", symbol: "AUD", name: "Australian Dollar", kind: "fiat", suggested: true },
  { code: "CAD", symbol: "CAD", name: "Canadian Dollar", kind: "fiat", suggested: true },
  { code: "SGD", symbol: "SGD", name: "Singapore Dollar", kind: "fiat", suggested: true },
  { code: "HKD", symbol: "HKD", name: "Hong Kong Dollar", kind: "fiat", suggested: true },
  { code: "CHF", symbol: "CHF", name: "Swiss Franc", kind: "fiat", suggested: true },
  { code: "INR", symbol: "Rs.", name: "Indian Rupee", kind: "fiat", suggested: true },
  { code: "IDR", symbol: "Rp", name: "Indonesian Rupiah", kind: "fiat", suggested: true },
  { code: "KRW", symbol: "₩", name: "Korean Won", kind: "fiat", suggested: true },
  { code: "THB", symbol: "฿", name: "Thai Baht", kind: "fiat", suggested: true },
  { code: "MYR", symbol: "RM", name: "Malaysian Ringgit", kind: "fiat", suggested: true },
  { code: "VND", symbol: "₫", name: "Vietnamese Dong", kind: "fiat", suggested: true },
  { code: "AFN", symbol: "AFN", name: "Afghani", kind: "fiat" },
  { code: "AED", symbol: "AED", name: "United Arab Emirates Dirham", kind: "fiat" },
  { code: "BDT", symbol: "Tk", name: "Bangladeshi Taka", kind: "fiat" },
  { code: "BRL", symbol: "R$", name: "Brazilian Real", kind: "fiat" },
  { code: "BHD", symbol: "BHD", name: "Bahraini Dinar", kind: "fiat" },
  { code: "BND", symbol: "BND", name: "Brunei Dollar", kind: "fiat" },
  { code: "CNY", symbol: "RMB", name: "Chinese Yuan", kind: "fiat" },
  { code: "COP", symbol: "COP", name: "Colombian Peso", kind: "fiat" },
  { code: "CZK", symbol: "Kč", name: "Czech Koruna", kind: "fiat" },
  { code: "DKK", symbol: "DKK", name: "Danish Krone", kind: "fiat" },
  { code: "EGP", symbol: "EGP", name: "Egyptian Pound", kind: "fiat" },
  { code: "FJD", symbol: "FJ$", name: "Fiji Dollar", kind: "fiat" },
  { code: "HUF", symbol: "Ft", name: "Hungarian Forint", kind: "fiat" },
  { code: "ILS", symbol: "₪", name: "Israeli Shekel", kind: "fiat" },
  { code: "JOD", symbol: "JOD", name: "Jordanian Dinar", kind: "fiat" },
  { code: "KWD", symbol: "KWD", name: "Kuwaiti Dinar", kind: "fiat" },
  { code: "KZT", symbol: "₸", name: "Kazakh Tenge", kind: "fiat" },
  { code: "LAK", symbol: "₭", name: "Lao Kip", kind: "fiat" },
  { code: "LKR", symbol: "රු", name: "Sri Lanka Rupee", kind: "fiat" },
  { code: "MXN", symbol: "MXN", name: "Mexican Peso", kind: "fiat" },
  { code: "MVR", symbol: "Rf", name: "Maldivian Rufiyaa", kind: "fiat" },
  { code: "NGN", symbol: "₦", name: "Nigerian Naira", kind: "fiat" },
  { code: "NOK", symbol: "NOK", name: "Norwegian Krone", kind: "fiat" },
  { code: "NZD", symbol: "NZD", name: "New Zealand Dollar", kind: "fiat" },
  { code: "OMR", symbol: "OMR", name: "Omani Rial", kind: "fiat" },
  { code: "PKR", symbol: "PKR", name: "Pakistan Rupee", kind: "fiat" },
  { code: "QAR", symbol: "QAR", name: "Qatari Rial", kind: "fiat" },
  { code: "RUB", symbol: "₽", name: "Russian Ruble", kind: "fiat" },
  { code: "RON", symbol: "lei", name: "Romanian Leu", kind: "fiat" },
  { code: "SAR", symbol: "SAR", name: "Saudi Riyal", kind: "fiat" },
  { code: "SEK", symbol: "SEK", name: "Swedish Krona", kind: "fiat" },
  { code: "KHR", symbol: "៛", name: "Cambodian Riel", kind: "fiat" },
  { code: "RWF", symbol: "Rf", name: "Rwandan Franc", kind: "fiat" },
  { code: "CLF", symbol: "CLF", name: "Unidad de Fomento", kind: "fiat" },
  { code: "SLL", symbol: "SLE", name: "Sierra Leonean Leone", kind: "fiat" },
  { code: "CHF", symbol: "CHF", name: "Swiss Franc", kind: "fiat" },
  { code: "SBD", symbol: "SBD", name: "Solomon Islands Dollar", kind: "fiat" },
  { code: "SCR", symbol: "SCR", name: "Seychellois Rupee", kind: "fiat" },
  { code: "SVC", symbol: "SVC", name: "Salvadoran Colon", kind: "fiat" },
  { code: "TND", symbol: "TND", name: "Tunisian Dinar", kind: "fiat" },
  { code: "TRY", symbol: "TL", name: "Turkish Lira", kind: "fiat" },
  { code: "TWD", symbol: "NT$", name: "Taiwan Dollar", kind: "fiat" },
  { code: "UAH", symbol: "грн", name: "Ukrainian hryvnia", kind: "fiat" },
  { code: "UGX", symbol: "UGX", name: "Ugandan Shilling", kind: "fiat" },
  { code: "UYU", symbol: "UYU", name: "Uruguayan Peso", kind: "fiat" },
  { code: "XPF", symbol: "XPF", name: "CFP Franc", kind: "fiat" },
  { code: "ZAR", symbol: "R", name: "South African Rand", kind: "fiat" },
  { code: "BWP", symbol: "BWP", name: "Botswanan Pula", kind: "fiat" },
  { code: "BSD", symbol: "BSD", name: "Bahamian Dollar", kind: "fiat" },
  { code: "BHD", symbol: "BHD", name: "Bahraini Dinar", kind: "fiat" },
  { code: "MAD", symbol: "MAD", name: "Moroccan Dirham", kind: "fiat" },
  { code: "MOP", symbol: "MOP", name: "Macanese Pataca", kind: "fiat" },
  { code: "MNT", symbol: "MNT", name: "Mongolian Tugrik", kind: "fiat" },
  { code: "PAB", symbol: "PAB", name: "Panamanian Balboa", kind: "fiat" },
  { code: "PEN", symbol: "PEN", name: "Peruvian Sol", kind: "fiat" },
  { code: "PLN", symbol: "zł", name: "Polish Zloty", kind: "fiat" },
  { code: "RSD", symbol: "RSD", name: "Serbian Dinar", kind: "fiat" },
  { code: "SAR", symbol: "SAR", name: "Saudi Riyal", kind: "fiat" },
  { code: "SYP", symbol: "SYP", name: "Syrian Pound", kind: "fiat" },
  { code: "TJS", symbol: "TJS", name: "Tajikistani Somoni", kind: "fiat" },
  { code: "YER", symbol: "YER", name: "Yemeni Rial", kind: "fiat" },
];

const CURRENCY_BY_CODE = new Map(CURRENCY_DEFINITIONS.map((definition) => [definition.code, definition] as const));

const SUPPORTED_CURRENCY_CODES = [
  "AFN",
  "AED",
  "AUD",
  "BHD",
  "BDT",
  "BRL",
  "CAD",
  "CHF",
  "CNY",
  "COP",
  "CZK",
  "DKK",
  "EGP",
  "EUR",
  "FJD",
  "GBP",
  "HKD",
  "HUF",
  "IDR",
  "ILS",
  "INR",
  "JOD",
  "JPY",
  "KHR",
  "KRW",
  "KWD",
  "KZT",
  "LAK",
  "LKR",
  "MVR",
  "MXN",
  "MYR",
  "NGN",
  "NOK",
  "NZD",
  "OMR",
  "PHP",
  "PKR",
  "PLN",
  "QAR",
  "RON",
  "RUB",
  "SAR",
  "SEK",
  "SGD",
  "THB",
  "TRY",
  "TWD",
  "UAH",
  "USD",
  "VND",
  "XPF",
  "ZAR",
] as const;

const SUGGESTED_CURRENCY_CODES = new Set(
  SUPPORTED_CURRENCY_CODES.filter((code) => CURRENCY_DEFINITIONS.some((definition) => definition.code === code && definition.suggested))
);

const normalizeCurrencyCode = (value?: string | null) => String(value ?? "").trim().toUpperCase();

const uniqueValues = (values: string[]) => Array.from(new Set(values.filter((value) => value.trim().length > 0)));

const getFallbackDefinition = (currency: string): CurrencyCatalogOption => ({
  code: currency,
  symbol: currency,
  name: currency,
  kind: "fiat",
});

export const getCurrencyName = (currency?: string | null) => {
  const code = normalizeCurrencyCode(currency);
  if (!code) {
    return "";
  }

  if (code === "MIXED") {
    return "Mixed currencies";
  }

  return CURRENCY_BY_CODE.get(code)?.name ?? code;
};

export const getCurrencySymbol = (currency?: string | null) => {
  const code = normalizeCurrencyCode(currency);
  if (!code) {
    return "";
  }

  if (code === "MIXED") {
    return "";
  }

  return CURRENCY_BY_CODE.get(code)?.symbol ?? code;
};

export const getCurrencyKind = (_currency?: string | null) => "fiat" as const;

export const getCurrencyCatalogOption = (currency?: string | null): CurrencyCatalogOption => {
  const code = normalizeCurrencyCode(currency) || "PHP";
  return CURRENCY_BY_CODE.get(code) ?? getFallbackDefinition(code);
};

const supportedCurrencyCodes = () => [...SUPPORTED_CURRENCY_CODES];

export const getCurrencyCatalogCodes = () => supportedCurrencyCodes();

export const getSuggestedCurrencyCatalogCodes = () =>
  CURRENCY_DEFINITIONS.filter((definition) => SUGGESTED_CURRENCY_CODES.has(definition.code)).map((definition) => definition.code);

const currencyNameComparator = (left: CurrencyCatalogOption, right: CurrencyCatalogOption) => {
  const nameCompare = left.name.localeCompare(right.name, DEFAULT_LOCALE, { sensitivity: "base" });
  if (nameCompare !== 0) {
    return nameCompare;
  }

  return left.code.localeCompare(right.code, DEFAULT_LOCALE, { sensitivity: "base" });
};

export const sortCurrencyCodes = (codes: string[]) => {
  const normalized = uniqueValues(codes.map((code) => normalizeCurrencyCode(code)).filter(Boolean));
  const options = normalized.map((code) => getCurrencyCatalogOption(code));

  const suggested = options.filter((option) => SUGGESTED_CURRENCY_CODES.has(option.code));
  const remaining = options.filter((option) => !SUGGESTED_CURRENCY_CODES.has(option.code));

  suggested.sort((left, right) => {
    const leftPriority = getSuggestedCurrencyCatalogCodes().indexOf(left.code);
    const rightPriority = getSuggestedCurrencyCatalogCodes().indexOf(right.code);
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return currencyNameComparator(left, right);
  });

  remaining.sort(currencyNameComparator);

  return [...suggested, ...remaining].map((option) => option.code);
};

export const getCurrencyCatalogOptions = (codes: string[]) =>
  sortCurrencyCodes(codes).map((code) => getCurrencyCatalogOption(code));

export const getCurrencyCatalogSections = (codes: string[]) => {
  const options = getCurrencyCatalogOptions(codes);
  const suggested = options.filter((option) => SUGGESTED_CURRENCY_CODES.has(option.code));
  const remaining = options.filter((option) => !SUGGESTED_CURRENCY_CODES.has(option.code));

  return [
    { label: "Suggested", options: suggested },
    { label: "All Currencies", options: remaining },
  ];
};
