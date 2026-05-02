const DEFAULT_LOCALE = "en";

const DISPLAY_NAMES =
  typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames([DEFAULT_LOCALE], { type: "currency" }) : null;

const POPULAR_FIAT_CURRENCIES = ["PHP", "USD", "EUR", "GBP", "JPY", "AUD", "CAD", "SGD", "HKD", "CHF", "CNY", "INR", "KRW", "THB", "MYR", "IDR", "VND"];

const CRYPTO_CURRENCIES = [
  "BTC",
  "ETH",
  "USDT",
  "USDC",
  "SOL",
  "XRP",
  "ADA",
  "DOGE",
  "BNB",
  "TRX",
  "WBTC",
  "LTC",
  "BCH",
  "AVAX",
  "LINK",
  "DOT",
  "UNI",
  "DAI",
  "XLM",
  "TON",
  "HBAR",
  "SUI",
  "NEAR",
  "XMR",
  "PAXG",
  "PYUSD",
  "USDE",
  "USDS",
  "USDG",
  "CRO",
  "ZEC",
  "OKB",
  "LEO",
  "SHIB",
  "TAO",
];

const CURRENCY_COUNTRY_CODE_MAP: Record<string, string> = {
  AED: "ae",
  AFN: "af",
  ALL: "al",
  AMD: "am",
  AOA: "ao",
  ARS: "ar",
  AUD: "au",
  AZN: "az",
  BBD: "bb",
  BDT: "bd",
  BGN: "bg",
  BHD: "bh",
  BOB: "bo",
  BND: "bn",
  BRL: "br",
  BSD: "bs",
  BWP: "bw",
  CAD: "ca",
  CHF: "ch",
  CLP: "cl",
  CNY: "cn",
  COP: "co",
  CRC: "cr",
  CZK: "cz",
  DKK: "dk",
  DOP: "do",
  DZD: "dz",
  EGP: "eg",
  ETB: "et",
  EUR: "eu",
  FJD: "fj",
  GEL: "ge",
  GBP: "gb",
  GHS: "gh",
  HKD: "hk",
  HRK: "hr",
  HUF: "hu",
  IDR: "id",
  ILS: "il",
  INR: "in",
  ISK: "is",
  JMD: "jm",
  JPY: "jp",
  KES: "ke",
  KGS: "kg",
  KHR: "kh",
  KRW: "kr",
  KWD: "kw",
  KZT: "kz",
  LAK: "la",
  LBP: "lb",
  LKR: "lk",
  MAD: "ma",
  MNT: "mn",
  MOP: "mo",
  MXN: "mx",
  MYR: "my",
  NAD: "na",
  NGN: "ng",
  NOK: "no",
  NPR: "np",
  NZD: "nz",
  PAB: "pa",
  PEN: "pe",
  PGK: "pg",
  PHP: "ph",
  PKR: "pk",
  PLN: "pl",
  QAR: "qa",
  RON: "ro",
  RSD: "rs",
  RUB: "ru",
  RWF: "rw",
  SAR: "sa",
  SBD: "sb",
  SCR: "sc",
  SEK: "se",
  SGD: "sg",
  SLE: "sl",
  SRD: "sr",
  SSP: "ss",
  SVC: "sv",
  THB: "th",
  TND: "tn",
  TRY: "tr",
  TWD: "tw",
  UGX: "ug",
  USD: "us",
  UYU: "uy",
  VND: "vn",
  XOF: "sn",
  ZAR: "za",
};

const FALLBACK_FLAG = "xx";

const normalizeCurrencyCode = (value?: string | null) => String(value ?? "").trim().toUpperCase();

const uniqueValues = (values: string[]) => Array.from(new Set(values.filter((value) => value.trim().length > 0)));

const getSupportedFiatCurrencies = () => {
  const supported = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("currency") : [];
  return supported
    .map((code) => normalizeCurrencyCode(code))
    .filter((code) => /^[A-Z]{3}$/.test(code))
    .filter((code) => !CRYPTO_CURRENCIES.includes(code));
};

export const getCurrencyName = (currency?: string | null) => {
  const code = normalizeCurrencyCode(currency);
  if (!code) {
    return "";
  }

  if (code === "MIXED") {
    return "Mixed currencies";
  }

  if (CRYPTO_CURRENCIES.includes(code)) {
    const cryptoNames: Record<string, string> = {
      ADA: "Cardano",
      AVAX: "Avalanche",
      BCH: "Bitcoin Cash",
      BNB: "BNB",
      BTC: "Bitcoin",
      CRO: "Cronos",
      DAI: "Dai",
      DOGE: "Dogecoin",
      DOT: "Polkadot",
      ETH: "Ether",
      HBAR: "Hedera",
      LEO: "LEO Token",
      LINK: "Chainlink",
      LTC: "Litecoin",
      NEAR: "NEAR Protocol",
      OKB: "OKB",
      PAXG: "PAX Gold",
      PYUSD: "PayPal USD",
      SHIB: "Shiba Inu",
      SOL: "Solana",
      SUI: "Sui",
      TAO: "Bittensor",
      TON: "Toncoin",
      TRX: "TRON",
      UNI: "Uniswap",
      USDC: "USD Coin",
      USDE: "Ethena USDe",
      USDG: "Global Dollar",
      USDS: "USDS",
      USDT: "Tether",
      WBTC: "Wrapped Bitcoin",
      XLM: "Stellar",
      XMR: "Monero",
      XRP: "XRP",
      ZEC: "Zcash",
    };

    return cryptoNames[code] ?? code;
  }

  return DISPLAY_NAMES?.of(code) ?? code;
};

export const getCurrencyKind = (currency?: string | null) => (CRYPTO_CURRENCIES.includes(normalizeCurrencyCode(currency)) ? "crypto" : "fiat");

export const getCurrencyFlagCode = (currency?: string | null) => {
  const code = normalizeCurrencyCode(currency);
  if (!code || CRYPTO_CURRENCIES.includes(code)) {
    return null;
  }

  return CURRENCY_COUNTRY_CODE_MAP[code] ?? FALLBACK_FLAG;
};

export const getCurrencyLogoCandidates = (currency?: string | null) => {
  const code = normalizeCurrencyCode(currency);
  if (!code) {
    return [];
  }

  if (CRYPTO_CURRENCIES.includes(code)) {
    const stem = code.toLowerCase();
    return uniqueValues([
      `/assets/investments/crypto/${stem}.png`,
      `/assets/investments/crypto/${stem}.webp`,
      `/assets/investments/crypto/${stem}.jpg`,
      `/assets/investments/crypto/${stem}.jpeg`,
      `/assets/investments/crypto/${stem}.svg`,
      `/assets/investments/crypto/${stem}.avif`,
    ]);
  }

  const flagCode = getCurrencyFlagCode(code) ?? FALLBACK_FLAG;
  return [`/assets/currency/${flagCode}.svg`];
};

export type CurrencyCatalogOption = {
  code: string;
  name: string;
  kind: "fiat" | "crypto";
  logoSrcs: string[];
};

export const getCurrencyCatalogOption = (currency?: string | null): CurrencyCatalogOption => {
  const code = normalizeCurrencyCode(currency) || "PHP";

  return {
    code,
    name: getCurrencyName(code),
    kind: getCurrencyKind(code),
    logoSrcs: getCurrencyLogoCandidates(code),
  };
};

const supportedCurrencyCodes = () => uniqueValues([...POPULAR_FIAT_CURRENCIES, ...getSupportedFiatCurrencies(), ...CRYPTO_CURRENCIES]);

export const getCurrencyCatalogCodes = () => supportedCurrencyCodes();

export const sortCurrencyCodes = (codes: string[]) => {
  const order = new Map(POPULAR_FIAT_CURRENCIES.map((code, index) => [code, index] as const));
  const normalized = uniqueValues(codes.map((code) => normalizeCurrencyCode(code)).filter(Boolean));

  return normalized.sort((left, right) => {
    const leftPriority = order.has(left) ? order.get(left) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
    const rightPriority = order.has(right) ? order.get(right) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    const leftName = getCurrencyName(left);
    const rightName = getCurrencyName(right);
    const nameCompare = leftName.localeCompare(rightName, DEFAULT_LOCALE, { sensitivity: "base" });
    if (nameCompare !== 0) {
      return nameCompare;
    }

    return left.localeCompare(right, DEFAULT_LOCALE, { sensitivity: "base" });
  });
};

export const getCurrencyCatalogOptions = (codes: string[]) =>
  sortCurrencyCodes(codes).map((code) => getCurrencyCatalogOption(code));
