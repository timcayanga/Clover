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

const CURRENCY_FLAG_MAP: Record<string, string> = {
  AED: "ae",
  ARS: "ar",
  AUD: "au",
  BDT: "bd",
  BHD: "bh",
  BGN: "bg",
  BND: "bn",
  BRL: "br",
  CAD: "ca",
  CHF: "ch",
  CLP: "cl",
  CNY: "cn",
  COP: "co",
  CZK: "cz",
  DKK: "dk",
  EGP: "eg",
  EUR: "eu",
  GBP: "gb",
  GHS: "gh",
  HKD: "hk",
  HUF: "hu",
  IDR: "id",
  ILS: "il",
  INR: "in",
  JPY: "jp",
  KES: "ke",
  KRW: "kr",
  KWD: "kw",
  LKR: "lk",
  MAD: "ma",
  MNT: "mn",
  MXN: "mx",
  MYR: "my",
  NGN: "ng",
  NOK: "no",
  NZD: "nz",
  PEN: "pe",
  PHP: "ph",
  PKR: "pk",
  PLN: "pl",
  QAR: "qa",
  RON: "ro",
  SAR: "sa",
  SEK: "se",
  SGD: "sg",
  THB: "th",
  TRY: "tr",
  TWD: "tw",
  UGX: "ug",
  USD: "us",
  VND: "vn",
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

  return CURRENCY_FLAG_MAP[code] ?? FALLBACK_FLAG;
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
