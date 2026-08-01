const normalizeSpace = (value: string) => value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

const CURRENCY_ALIASES: Record<string, string> = {
  AED: "AED", DIRHAM: "AED", DIRHAMS: "AED", "UAE DIRHAM": "AED", "UAE DIRHAMS": "AED",
  AFN: "AFN", AFGHANI: "AFN",
  ALL: "ALL", LEK: "ALL",
  AMD: "AMD", DRAM: "AMD",
  ARS: "ARS", "ARGENTINE PESO": "ARS",
  AUD: "AUD", "AUSTRALIAN DOLLAR": "AUD", "AUSTRALIAN DOLLARS": "AUD",
  AZN: "AZN", MANAT: "AZN",
  BDT: "BDT", TAKA: "BDT",
  BGN: "BGN", LEV: "BGN",
  BHD: "BHD", "BAHRAINI DINAR": "BHD",
  BRL: "BRL", REAL: "BRL", REAIS: "BRL", "BRAZILIAN REAL": "BRL",
  BTC: "BTC", BITCOIN: "BTC",
  CAD: "CAD", "CANADIAN DOLLAR": "CAD", "CANADIAN DOLLARS": "CAD",
  CHF: "CHF", "SWISS FRANC": "CHF", "SWISS FRANCS": "CHF",
  CLP: "CLP", "CHILEAN PESO": "CLP",
  CNY: "CNY", RMB: "CNY", RENMINBI: "CNY", "CHINESE YUAN": "CNY",
  COP: "COP", "COLOMBIAN PESO": "COP",
  CRC: "CRC", COLON: "CRC",
  CZK: "CZK", KORUNA: "CZK",
  DKK: "DKK", "DANISH KRONE": "DKK",
  DOP: "DOP", "DOMINICAN PESO": "DOP",
  EGP: "EGP", "EGYPTIAN POUND": "EGP",
  ETH: "ETH", ETHER: "ETH", ETHEREUM: "ETH",
  EUR: "EUR", EURO: "EUR", EUROS: "EUR",
  GBP: "GBP", STERLING: "GBP", "POUND STERLING": "GBP", "BRITISH POUND": "GBP", "BRITISH POUNDS": "GBP",
  GEL: "GEL", LARI: "GEL",
  GHS: "GHS", CEDI: "GHS",
  HKD: "HKD", "HONG KONG DOLLAR": "HKD", "HONG KONG DOLLARS": "HKD",
  HUF: "HUF", FORINT: "HUF",
  IDR: "IDR", RUPIAH: "IDR",
  ILS: "ILS", SHEKEL: "ILS", SHEKELS: "ILS", "NEW ISRAELI SHEKEL": "ILS",
  INR: "INR", "INDIAN RUPEE": "INR", "INDIAN RUPEES": "INR",
  ISK: "ISK", "ICELANDIC KRONA": "ISK",
  JOD: "JOD", "JORDANIAN DINAR": "JOD",
  JPY: "JPY", YEN: "JPY", "JAPANESE YEN": "JPY",
  KES: "KES", "KENYAN SHILLING": "KES", "KENYAN SHILLINGS": "KES",
  KRW: "KRW", WON: "KRW", "SOUTH KOREAN WON": "KRW",
  KWD: "KWD", "KUWAITI DINAR": "KWD",
  KZT: "KZT", TENGE: "KZT",
  LKR: "LKR", "SRI LANKAN RUPEE": "LKR", "SRI LANKAN RUPEES": "LKR",
  MAD: "MAD", "MOROCCAN DIRHAM": "MAD",
  MXN: "MXN", "MEXICAN PESO": "MXN", "MEXICAN PESOS": "MXN",
  MYR: "MYR", RINGGIT: "MYR", "MALAYSIAN RINGGIT": "MYR",
  NGN: "NGN", NAIRA: "NGN",
  NOK: "NOK", "NORWEGIAN KRONE": "NOK",
  NPR: "NPR", "NEPALESE RUPEE": "NPR", "NEPALESE RUPEES": "NPR",
  NZD: "NZD", "NEW ZEALAND DOLLAR": "NZD", "NEW ZEALAND DOLLARS": "NZD",
  OMR: "OMR", "OMANI RIAL": "OMR",
  PEN: "PEN", "PERUVIAN SOL": "PEN",
  PHP: "PHP", PESO: "PHP", PESOS: "PHP", "PHILIPPINE PESO": "PHP", "PHILIPPINE PESOS": "PHP",
  PKR: "PKR", "PAKISTANI RUPEE": "PKR", "PAKISTANI RUPEES": "PKR",
  PLN: "PLN", ZLOTY: "PLN",
  QAR: "QAR", "QATARI RIYAL": "QAR",
  RON: "RON", LEU: "RON",
  RSD: "RSD", "SERBIAN DINAR": "RSD",
  RUB: "RUB", RUBLE: "RUB", RUBLES: "RUB",
  SAR: "SAR", "SAUDI RIYAL": "SAR",
  SEK: "SEK", "SWEDISH KRONA": "SEK",
  SGD: "SGD", "SINGAPORE DOLLAR": "SGD", "SINGAPORE DOLLARS": "SGD",
  THB: "THB", BAHT: "THB", "THAI BAHT": "THB",
  TRY: "TRY", "TURKISH LIRA": "TRY", LIRA: "TRY",
  TWD: "TWD", "NEW TAIWAN DOLLAR": "TWD", "TAIWAN DOLLAR": "TWD",
  UAH: "UAH", HRYVNIA: "UAH",
  USD: "USD", "US DOLLAR": "USD", "US DOLLARS": "USD", "U.S. DOLLAR": "USD", "U.S. DOLLARS": "USD",
  ADA: "ADA", BNB: "BNB", DOGE: "DOGE", SOL: "SOL", USDC: "USDC", USDT: "USDT", XRP: "XRP",
  UYU: "UYU", "URUGUAYAN PESO": "UYU",
  VND: "VND", DONG: "VND", "VIETNAMESE DONG": "VND",
  ZAR: "ZAR", RAND: "ZAR", "SOUTH AFRICAN RAND": "ZAR",
};

const ISO_CODES = new Set(Object.values(CURRENCY_ALIASES));
const COMPACT_CURRENCY_ALIASES = new Map(
  Object.entries(CURRENCY_ALIASES).map(([alias, code]) => [alias.replace(/[^A-Z0-9]/g, ""), code])
);

const normalizeAliasKey = (value: string) =>
  normalizeSpace(value)
    .toUpperCase()
    .replace(/[._]/g, " ")
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const normalizeGlobalCurrencyCode = (value?: string | null) => {
  if (!value) return null;
  const symbolAlias: Record<string, string> = {
    "US$": "USD", "U.S.$": "USD", "A$": "AUD", "AU$": "AUD", "C$": "CAD", "CA$": "CAD",
    "S$": "SGD", "HK$": "HKD", "NZ$": "NZD", "R$": "BRL", "CN¥": "CNY", "JP¥": "JPY",
  };
  const raw = normalizeSpace(value).toUpperCase();
  if (symbolAlias[raw]) return symbolAlias[raw];
  const normalized = normalizeAliasKey(value);
  if (normalized === "U S DOLLAR" || normalized === "U S DOLLARS") return "USD";
  return CURRENCY_ALIASES[normalized] ?? COMPACT_CURRENCY_ALIASES.get(normalized.replace(/[^A-Z0-9]/g, "")) ?? (ISO_CODES.has(normalized) ? normalized : null);
};

export type CurrencyDetectionResult = {
  currency: string | null;
  confidence: number;
  ambiguous: boolean;
  evidence: string[];
};

type CurrencyScore = { score: number; evidence: Set<string> };

const addCurrencyEvidence = (scores: Map<string, CurrencyScore>, code: string, score: number, evidence: string) => {
  const existing = scores.get(code) ?? { score: 0, evidence: new Set<string>() };
  existing.score += score;
  existing.evidence.add(evidence);
  scores.set(code, existing);
};

const SYMBOL_PATTERNS: Array<{ code: string; pattern: RegExp; label: string }> = [
  { code: "PHP", pattern: /₱/g, label: "₱ symbol" },
  { code: "EUR", pattern: /€/g, label: "€ symbol" },
  { code: "GBP", pattern: /£/g, label: "£ symbol" },
  { code: "INR", pattern: /₹/g, label: "₹ symbol" },
  { code: "THB", pattern: /฿/g, label: "฿ symbol" },
  { code: "KRW", pattern: /₩/g, label: "₩ symbol" },
  { code: "VND", pattern: /₫/g, label: "₫ symbol" },
  { code: "TRY", pattern: /₺/g, label: "₺ symbol" },
  { code: "RUB", pattern: /₽/g, label: "₽ symbol" },
  { code: "ILS", pattern: /₪/g, label: "₪ symbol" },
  { code: "NGN", pattern: /₦/g, label: "₦ symbol" },
  { code: "GHS", pattern: /₵/g, label: "₵ symbol" },
  { code: "JPY", pattern: /(?:JP¥|JPY\s*¥)/gi, label: "Japanese yen symbol" },
  { code: "CNY", pattern: /(?:CN¥|RMB\s*¥)/gi, label: "Chinese yuan symbol" },
  { code: "USD", pattern: /(?:US\$|USD\s*\$)/gi, label: "US dollar symbol" },
  { code: "CAD", pattern: /(?:CA?\$|CAD\s*\$)/gi, label: "Canadian dollar symbol" },
  { code: "AUD", pattern: /(?:AU?\$|AUD\s*\$)/gi, label: "Australian dollar symbol" },
  { code: "NZD", pattern: /(?:NZ\$|NZD\s*\$)/gi, label: "New Zealand dollar symbol" },
  { code: "SGD", pattern: /(?:S\$|SGD\s*\$)/gi, label: "Singapore dollar symbol" },
  { code: "HKD", pattern: /(?:HK\$|HKD\s*\$)/gi, label: "Hong Kong dollar symbol" },
  { code: "BRL", pattern: /(?:R\$|BRL\s*R\$)/gi, label: "Brazilian real symbol" },
];

export const detectCurrencyEvidence = (text: string): CurrencyDetectionResult => {
  const normalized = text.replace(/\u00a0/g, " ");
  const lines = normalized.split(/\r?\n/).map(normalizeSpace).filter(Boolean);
  const scores = new Map<string, CurrencyScore>();

  for (const [index, line] of lines.entries()) {
    const labeled = line.match(/\b(?:(?:account|statement|base|wallet|card|settlement|reporting)\s+)?currency(?:\s+code)?\s*[:\-]?\s*([A-Za-z][A-Za-z .]{1,28}|[A-Z]{3,4})\b/i);
    const labeledCode = normalizeGlobalCurrencyCode(labeled?.[1] ?? null);
    if (labeledCode) addCurrencyEvidence(scores, labeledCode, 150, `explicit currency label: ${labeled![1].trim()}`);

    for (const code of ISO_CODES) {
      const matches = line.match(new RegExp(`\\b${code}\\b`, "gi"));
      if (!matches?.length) continue;
      const headerWeight = index < 24 ? 34 : 10;
      addCurrencyEvidence(scores, code, headerWeight + Math.min(matches.length, 3) * 7, `${code} code${index < 24 ? " in statement header" : ""}`);
    }

    for (const [alias, code] of Object.entries(CURRENCY_ALIASES)) {
      if (alias.length < 5 || alias === code) continue;
      if (new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(line)) {
        addCurrencyEvidence(scores, code, index < 24 ? 45 : 12, `${alias.toLowerCase()} name`);
      }
    }
  }

  for (const { code, pattern, label } of SYMBOL_PATTERNS) {
    const matches = normalized.match(pattern);
    if (matches?.length) addCurrencyEvidence(scores, code, 58 + Math.min(matches.length, 5) * 3, label);
  }

  const ranked = [...scores.entries()]
    .map(([currency, value]) => ({ currency, score: value.score, evidence: [...value.evidence] }))
    .sort((left, right) => right.score - left.score);
  const winner = ranked[0];
  if (!winner) {
    const ambiguousSymbol = /(?:^|[^A-Z])\$|¥/.test(normalized);
    return { currency: null, confidence: 0, ambiguous: ambiguousSymbol, evidence: ambiguousSymbol ? ["ambiguous currency symbol"] : [] };
  }

  const runnerUp = ranked[1];
  const explicitWinner = winner.evidence.some((item) => item.startsWith("explicit currency label"));
  const conflictingExplicit = runnerUp?.evidence.some((item) => item.startsWith("explicit currency label")) ?? false;
  const ambiguous = Boolean(
    runnerUp && ((conflictingExplicit && explicitWinner) || (!explicitWinner && winner.score - runnerUp.score < 24))
  );

  return {
    currency: ambiguous ? null : winner.currency,
    confidence: ambiguous ? Math.min(49, winner.score) : Math.min(100, explicitWinner ? 100 : Math.round(winner.score)),
    ambiguous,
    evidence: ambiguous && runnerUp
      ? [...winner.evidence, ...runnerUp.evidence, `conflicting currency evidence: ${winner.currency}/${runnerUp.currency}`]
      : winner.evidence,
  };
};

export type InstitutionDetectionResult = {
  institution: string | null;
  confidence: number;
  evidence: string[];
};

const INSTITUTION_WORD = /\b(?:bank|banco|banque|banca|banka|bankasi|bankası|credit\s+union|building\s+society|savings\s+(?:bank|and\s+loan)|sparkasse|volksbank|raiffeisen|caisse|caja|microfinance\s+bank|digital\s+bank)\b/i;
const REJECT_INSTITUTION_LINE = /\b(?:beneficiary|recipient|intermediary|correspondent|destination|receiving|payee|merchant|transfer(?:red)?\s+to|payment\s+to|bank\s+statement|bank\s+account|bank\s+details|bank\s+reference|banking\s+date|sort\s+code|swift|bic|iban|transaction)\b/i;

const cleanInstitutionCandidate = (value: string) =>
  normalizeSpace(value)
    .replace(/^(?:bank\s+name|financial\s+institution|account\s+provider|issued\s+by|institution)\s*[:\-]\s*/i, "")
    .replace(/\.(?:pdf|csv|xlsx?|txt)$/i, "")
    .replace(/\b(?:account|card)?\s*statement\b.*$/i, "")
    .replace(/\b(?:19|20)\d{2}[-_/.]\d{1,2}(?:[-_/.]\d{1,2})?\b.*$/i, "")
    .replace(/[_]+/g, " ")
    .replace(/[|]+.*$/, "")
    .trim();

const isUsableInstitutionCandidate = (candidate: string, requireInstitutionWord: boolean) =>
  candidate.length >= 3 &&
  candidate.length <= 90 &&
  /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(candidate) &&
  !REJECT_INSTITUTION_LINE.test(candidate) &&
  !/\b(?:statement|summary|customer|account\s+holder|opening\s+balance|closing\s+balance|available\s+balance)\b/i.test(candidate) &&
  (!requireInstitutionWord || INSTITUTION_WORD.test(candidate));

export const detectUnknownInstitutionEvidence = (
  text: string,
  options: { fileName?: string | null; headerLines?: string[] } = {}
): InstitutionDetectionResult => {
  const lines = (options.headerLines?.length ? options.headerLines : text.split(/\r?\n/))
    .map(normalizeSpace)
    .filter(Boolean)
    .slice(0, 28);
  const statementShell = /\b(?:statement|account\s+(?:number|no\.?|summary)|opening\s+balance|closing\s+balance|transaction\s+(?:date|details)|available\s+balance)\b/i.test(
    `${lines.join(" ")} ${options.fileName ?? ""}`
  );

  for (const line of lines) {
    const match = line.match(/^\s*(?:bank\s+name|financial\s+institution|account\s+provider|issued\s+by|institution)\s*[:\-]\s*(.+)$/i);
    const candidate = cleanInstitutionCandidate(match?.[1] ?? "");
    if (match && isUsableInstitutionCandidate(candidate, false)) {
      return { institution: candidate, confidence: 100, evidence: [`explicit institution label: ${match[1].trim()}`] };
    }
  }

  if (statementShell) {
    for (const line of lines.slice(0, 14)) {
      const candidate = cleanInstitutionCandidate(line);
      if (isUsableInstitutionCandidate(candidate, true)) {
        return { institution: candidate, confidence: 84, evidence: ["financial institution name in statement header"] };
      }
    }
  }

  const fileCandidate = cleanInstitutionCandidate(options.fileName ?? "");
  if (statementShell && isUsableInstitutionCandidate(fileCandidate, true)) {
    return { institution: fileCandidate, confidence: 70, evidence: ["financial institution name in statement filename"] };
  }

  return { institution: null, confidence: 0, evidence: [] };
};
