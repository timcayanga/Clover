/**
 * Versioned context corpus for transaction normalization.
 *
 * This corpus provides evidence and hints; it must not replace a user's
 * confirmed transaction values. Keep raw statement text outside this module.
 */

export const CONTEXT_CORPUS_VERSION = "2026.07.5";

export type ContextSignal = {
  id: string;
  kind: "institution" | "payment_rail" | "travel" | "fee" | "currency" | "merchant";
  value: string;
  confidence: number;
  evidence: string;
  source: "curated" | "learned" | "user_confirmed";
  reviewStatus: "active" | "candidate" | "retired";
};

export type RegionalParsingProfile = {
  countryCode: string;
  regionCode: string;
  locales: string[];
  primaryLocale: string;
  languages: string[];
  dateOrder: "mdy" | "dmy" | "ymd" | "unknown";
  decimalSeparator: "." | ",";
  groupingSeparator: "," | "." | " " | "unknown";
  defaultCurrency: string;
  legalEntitySuffixes: string[];
  confidence: number;
  source?: ContextSignal["source"];
  reviewStatus?: ContextSignal["reviewStatus"];
};

export type TransactionContext = {
  corpusVersion: string;
  countryCode: string | null;
  regionCode: string | null;
  paymentRail: string | null;
  institutionType: string | null;
  currency: string | null;
  categoryHint: string | null;
  transactionTypeHint: "income" | "expense" | "transfer" | null;
  primaryLocale: string | null;
  dateOrder: RegionalParsingProfile["dateOrder"];
  decimalSeparator: RegionalParsingProfile["decimalSeparator"] | null;
  groupingSeparator: RegionalParsingProfile["groupingSeparator"] | null;
  languages: string[];
  legalEntitySuffixes: string[];
  parsingProfileConfidence: number;
  travelLikely: boolean;
  foreignCurrencyLikely: boolean;
  contextStatus: "matched" | "ambiguous" | "unmatched";
  matchedEntryIds: string[];
  fieldConfidence: {
    countryCode: number;
    regionCode: number;
    paymentRail: number;
    institutionType: number;
    currency: number;
    categoryHint: number;
    transactionTypeHint: number;
  };
  signals: ContextSignal[];
  confidence: number;
  evidence: string[];
};

type ContextEntry = {
  id: string;
  aliases: string[];
  negativeAliases?: string[];
  signalKind?: ContextSignal["kind"];
  countryCode: string;
  regionCode: string;
  paymentRail?: string;
  institutionType?: string;
  currency?: string;
  categoryHint?: string;
  transactionTypeHint?: TransactionContext["transactionTypeHint"];
  travelLikely?: boolean;
  foreignCurrencyLikely?: boolean;
  confidence: number;
  source?: ContextSignal["source"];
  reviewStatus?: ContextSignal["reviewStatus"];
};

const entries: ContextEntry[] = [
  // Philippines: launch market and strongest deterministic context.
  { id: "ph-gcash", aliases: ["gcash", "g-xchange", "gcash cash in", "gcash cash out"], signalKind: "payment_rail", countryCode: "PH", regionCode: "SEA", paymentRail: "gcash", institutionType: "wallet", currency: "PHP", transactionTypeHint: "transfer", confidence: 96 },
  { id: "ph-maya", aliases: ["maya", "maya wallet", "paymaya", "maya bank"], signalKind: "payment_rail", countryCode: "PH", regionCode: "SEA", paymentRail: "maya", institutionType: "wallet", currency: "PHP", transactionTypeHint: "transfer", confidence: 94 },
  { id: "ph-bank-transfer", aliases: ["instapay", "insta pay", "pesonet", "pesonet transfer"], signalKind: "payment_rail", countryCode: "PH", regionCode: "SEA", paymentRail: "philippines_bank_transfer", currency: "PHP", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 98 },
  { id: "ph-bpi", aliases: ["bpi", "bank of the philippine islands"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 98 },
  { id: "ph-bdo", aliases: ["bdo", "banco de oro"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 98 },
  { id: "ph-unionbank", aliases: ["unionbank", "union bank of the philippines"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 98 },
  { id: "ph-metrobank", aliases: ["metrobank", "metropolitan bank"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 98 },
  { id: "ph-security-bank", aliases: ["security bank"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 98 },
  { id: "ph-eastwest", aliases: ["eastwest", "east west bank"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 98 },
  { id: "ph-rcbc", aliases: ["rcbc", "rizal commercial banking"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 98 },
  { id: "ph-landbank", aliases: ["landbank", "land bank of the philippines"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 98 },
  { id: "ph-chinabank", aliases: ["chinabank", "china bank"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 98 },
  { id: "ph-psbank", aliases: ["psbank", "philippine savings bank"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 98 },
  { id: "ph-ucpb", aliases: ["ucpb", "united coconut planters bank"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 98 },
  { id: "ph-cimb", aliases: ["cimb", "gsave"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 94 },
  { id: "ph-maribank", aliases: ["maribank", "seabank philippines"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 94 },
  { id: "ph-gotyme", aliases: ["gotyme", "go tyme"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 94 },
  { id: "ph-aub", aliases: ["aub", "asia united bank"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 94 },
  { id: "ph-pnb", aliases: ["pnb", "philippine national bank"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 94 },

  // Southeast Asia expansion packs.
  { id: "sg-paynow", aliases: ["paynow", "fast transfer", "fast payments"], signalKind: "payment_rail", countryCode: "SG", regionCode: "SEA", paymentRail: "paynow_fast", currency: "SGD", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 96 },
  { id: "my-duitnow", aliases: ["duitnow", "instant transfer malaysia"], signalKind: "payment_rail", countryCode: "MY", regionCode: "SEA", paymentRail: "duitnow", currency: "MYR", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 96 },
  { id: "id-qris", aliases: ["qris", "bi-fast", "bifast"], signalKind: "payment_rail", countryCode: "ID", regionCode: "SEA", paymentRail: "qris_bi_fast", currency: "IDR", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 94 },
  { id: "th-promptpay", aliases: ["promptpay", "พร้อมเพย์"], signalKind: "payment_rail", countryCode: "TH", regionCode: "SEA", paymentRail: "promptpay", currency: "THB", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 96 },
  { id: "vn-napas", aliases: ["napas", "vietqr", "viet qr"], signalKind: "payment_rail", countryCode: "VN", regionCode: "SEA", paymentRail: "napas_vietqr", currency: "VND", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 92 },

  // Travel-heavy East Asia context.
  { id: "jp-transit", aliases: ["suica", "pasmo", "icoca", "jr east", "jr central"], signalKind: "travel", countryCode: "JP", regionCode: "EAS", paymentRail: "japan_transit", currency: "JPY", categoryHint: "Transport", transactionTypeHint: "expense", travelLikely: true, confidence: 92 },
  { id: "hk-wallet-rail", aliases: ["octopus", "alipay hk", "fps hong kong", "faster payment system"], signalKind: "payment_rail", countryCode: "HK", regionCode: "EAS", paymentRail: "hong_kong_fps", currency: "HKD", categoryHint: "Transfers", confidence: 90 },
  { id: "tw-wallet", aliases: ["line pay taiwan", "jko pay", "jkopay", "easycard"], signalKind: "payment_rail", countryCode: "TW", regionCode: "EAS", paymentRail: "taiwan_wallet", currency: "TWD", confidence: 88 },

  // Diaspora and international-account context.
  { id: "in-bank-rail", aliases: ["upi", "upi collect", "imps", "neft", "rtgs india"], signalKind: "payment_rail", countryCode: "IN", regionCode: "SAS", paymentRail: "india_bank_rail", currency: "INR", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 94 },
  { id: "ae-remittance", aliases: ["uae exchange", "al ansari exchange", "lu lu exchange", "remittance"], signalKind: "payment_rail", countryCode: "AE", regionCode: "MEA", paymentRail: "remittance", currency: "AED", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 86 },
  { id: "eu-sepa", aliases: ["sepa", "sepa direct debit", "iban transfer"], signalKind: "payment_rail", countryCode: "EU", regionCode: "EUR", paymentRail: "sepa", currency: "EUR", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 92 },
  { id: "us-ach-wallet", aliases: ["ach", "zelle", "venmo", "cash app"], signalKind: "payment_rail", countryCode: "US", regionCode: "NAM", paymentRail: "us_ach_wallet", currency: "USD", confidence: 88 },
  { id: "gb-bank-rail", aliases: ["faster payments", "bacs", "chaps", "direct debit uk"], signalKind: "payment_rail", countryCode: "GB", regionCode: "EUR", paymentRail: "uk_bank_rail", currency: "GBP", confidence: 90 },
  { id: "au-bank-rail", aliases: ["payid", "osko", "bpay"], signalKind: "payment_rail", countryCode: "AU", regionCode: "OCE", paymentRail: "australia_bank_rail", currency: "AUD", confidence: 88 },

  // Global providers and cross-border context.
  { id: "global-wise", aliases: ["wise", "wise transfer", "transferwise"], signalKind: "payment_rail", countryCode: "GLOBAL", regionCode: "GLOBAL", paymentRail: "cross_border_transfer", institutionType: "fintech", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 96 },
  { id: "global-paypal", aliases: ["paypal"], signalKind: "payment_rail", countryCode: "GLOBAL", regionCode: "GLOBAL", paymentRail: "paypal", institutionType: "wallet", confidence: 94 },
  { id: "global-card-network", aliases: ["visa", "mastercard", "american express", "amex"], signalKind: "institution", countryCode: "GLOBAL", regionCode: "GLOBAL", institutionType: "card_network", confidence: 82 },

  // Travel and FX signals intentionally do not infer a country on their own.
  { id: "global-airline", aliases: ["airlines", "airways", "airport", "flight", "booking.com", "agoda", "expedia"], signalKind: "travel", countryCode: "GLOBAL", regionCode: "GLOBAL", categoryHint: "Travel & Lifestyle", travelLikely: true, confidence: 78 },
  { id: "global-lodging", aliases: ["hotel", "resort", "hostel", "airbnb"], signalKind: "travel", countryCode: "GLOBAL", regionCode: "GLOBAL", categoryHint: "Travel & Lifestyle", travelLikely: true, confidence: 78 },
  { id: "global-fx-fee", aliases: ["foreign transaction fee", "international service fee", "currency conversion fee", "dynamic currency conversion", "dcc fee"], signalKind: "fee", countryCode: "GLOBAL", regionCode: "GLOBAL", categoryHint: "Financial", foreignCurrencyLikely: true, confidence: 94 },
  { id: "global-foreign-currency", aliases: ["exchange rate", "fx markup", "foreign exchange", "overseas transaction"], signalKind: "currency", countryCode: "GLOBAL", regionCode: "GLOBAL", foreignCurrencyLikely: true, confidence: 88 },

  // Financial semantics: these are hints, not automatic user categorization.
  { id: "global-salary-payroll", aliases: ["salary", "payroll", "pay credit", "wage payment"], signalKind: "merchant", countryCode: "GLOBAL", regionCode: "GLOBAL", categoryHint: "Income", transactionTypeHint: "income", confidence: 84 },
  { id: "global-tax", aliases: ["tax withheld", "withholding tax", "income tax", "vat", "gst", "sales tax"], signalKind: "fee", countryCode: "GLOBAL", regionCode: "GLOBAL", categoryHint: "Financial", transactionTypeHint: "expense", confidence: 82 },
  { id: "ph-contributions", aliases: ["sss", "philhealth", "pag ibig", "pag-ibig", "bir ewt", "expanded withholding tax"], signalKind: "fee", countryCode: "PH", regionCode: "SEA", currency: "PHP", categoryHint: "Financial", transactionTypeHint: "expense", confidence: 90 },
  { id: "sg-contributions", aliases: ["cpf contribution", "cpf", "iras gst"], signalKind: "fee", countryCode: "SG", regionCode: "SEA", currency: "SGD", categoryHint: "Financial", transactionTypeHint: "expense", confidence: 86 },
  { id: "my-contributions", aliases: ["epf contribution", "kwsp", "socso", "perkeso"], signalKind: "fee", countryCode: "MY", regionCode: "SEA", currency: "MYR", categoryHint: "Financial", transactionTypeHint: "expense", confidence: 86 },
  { id: "global-remittance-provider", aliases: ["western union", "moneygram", "remitly", "worldremit"], signalKind: "payment_rail", countryCode: "GLOBAL", regionCode: "GLOBAL", paymentRail: "remittance", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 90 },
];

const regionalProfiles: RegionalParsingProfile[] = [
  { countryCode: "PH", regionCode: "SEA", locales: ["en-PH", "fil-PH"], primaryLocale: "en-PH", languages: ["en", "fil"], dateOrder: "mdy", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "PHP", legalEntitySuffixes: ["inc", "corp", "corporation", "co", "ltd"], confidence: 86 },
  { countryCode: "SG", regionCode: "SEA", locales: ["en-SG", "zh-SG", "ms-SG"], primaryLocale: "en-SG", languages: ["en", "zh", "ms"], dateOrder: "dmy", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "SGD", legalEntitySuffixes: ["pte ltd", "ltd", "llp", "inc"] , confidence: 84 },
  { countryCode: "MY", regionCode: "SEA", locales: ["en-MY", "ms-MY", "zh-MY"], primaryLocale: "en-MY", languages: ["en", "ms", "zh"], dateOrder: "dmy", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "MYR", legalEntitySuffixes: ["sdn bhd", "bhd", "berhad", "ltd"], confidence: 84 },
  { countryCode: "ID", regionCode: "SEA", locales: ["id-ID", "en-ID"], primaryLocale: "id-ID", languages: ["id", "en"], dateOrder: "dmy", decimalSeparator: ",", groupingSeparator: ".", defaultCurrency: "IDR", legalEntitySuffixes: ["pt", "tbk", "cv", "persero"], confidence: 84 },
  { countryCode: "TH", regionCode: "SEA", locales: ["th-TH", "en-TH"], primaryLocale: "th-TH", languages: ["th", "en"], dateOrder: "dmy", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "THB", legalEntitySuffixes: ["co ltd", "ltd", "public company limited"], confidence: 78 },
  { countryCode: "VN", regionCode: "SEA", locales: ["vi-VN", "en-VN"], primaryLocale: "vi-VN", languages: ["vi", "en"], dateOrder: "dmy", decimalSeparator: ",", groupingSeparator: ".", defaultCurrency: "VND", legalEntitySuffixes: ["tnhh", "jsc", "cp", "co ltd"], confidence: 78 },
  { countryCode: "JP", regionCode: "EAS", locales: ["ja-JP", "en-JP"], primaryLocale: "ja-JP", languages: ["ja", "en"], dateOrder: "ymd", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "JPY", legalEntitySuffixes: ["kk", "kabushiki kaisha", "yugen kaisha"], confidence: 82 },
  { countryCode: "HK", regionCode: "EAS", locales: ["zh-HK", "en-HK"], primaryLocale: "zh-HK", languages: ["zh", "en"], dateOrder: "dmy", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "HKD", legalEntitySuffixes: ["ltd", "limited", "company"], confidence: 80 },
  { countryCode: "TW", regionCode: "EAS", locales: ["zh-TW", "en-TW"], primaryLocale: "zh-TW", languages: ["zh", "en"], dateOrder: "ymd", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "TWD", legalEntitySuffixes: ["co ltd", "ltd", "inc"], confidence: 78 },
  { countryCode: "IN", regionCode: "SAS", locales: ["en-IN", "hi-IN"], primaryLocale: "en-IN", languages: ["en", "hi"], dateOrder: "dmy", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "INR", legalEntitySuffixes: ["pvt ltd", "private limited", "ltd", "llp"], confidence: 82 },
  { countryCode: "AE", regionCode: "MEA", locales: ["en-AE", "ar-AE"], primaryLocale: "en-AE", languages: ["en", "ar"], dateOrder: "dmy", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "AED", legalEntitySuffixes: ["llc", "l l c", "pjsc", "est"], confidence: 80 },
  { countryCode: "EU", regionCode: "EUR", locales: ["en-IE", "de-DE", "fr-FR"], primaryLocale: "en-IE", languages: ["en", "de", "fr"], dateOrder: "dmy", decimalSeparator: ",", groupingSeparator: ".", defaultCurrency: "EUR", legalEntitySuffixes: ["gmbh", "sarl", "sa", "bv", "oy", "ab", "ltd"], confidence: 64 },
  { countryCode: "US", regionCode: "NAM", locales: ["en-US", "es-US"], primaryLocale: "en-US", languages: ["en", "es"], dateOrder: "mdy", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "USD", legalEntitySuffixes: ["inc", "incorporated", "llc", "corp", "corporation", "co"], confidence: 86 },
  { countryCode: "GB", regionCode: "EUR", locales: ["en-GB"], primaryLocale: "en-GB", languages: ["en"], dateOrder: "dmy", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "GBP", legalEntitySuffixes: ["ltd", "limited", "plc", "llp"], confidence: 86 },
  { countryCode: "AU", regionCode: "OCE", locales: ["en-AU"], primaryLocale: "en-AU", languages: ["en"], dateOrder: "dmy", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "AUD", legalEntitySuffixes: ["pty ltd", "proprietary limited", "ltd", "inc"], confidence: 86 },
];

const getRegionalProfile = (countryCode: string | null | undefined) =>
  regionalProfiles.find((profile) => profile.countryCode === countryCode) ?? null;

const emptyParsingContext = {
  primaryLocale: null,
  dateOrder: "unknown" as const,
  decimalSeparator: null,
  groupingSeparator: null,
  languages: [] as string[],
  legalEntitySuffixes: [] as string[],
  parsingProfileConfidence: 0,
};

const normalizeText = (value: unknown) =>
  String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const matchesAlias = (text: string, alias: string) => {
  const normalizedAlias = normalizeText(alias);
  if (!normalizedAlias) return false;
  const escapedAlias = normalizedAlias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)${escapedAlias}(?=$|\\s)`, "u").test(text);
};

export const resolveTransactionContext = (params: {
  institution?: string | null;
  accountName?: string | null;
  merchantRaw?: string | null;
  merchantClean?: string | null;
  description?: string | null;
  currency?: string | null;
}): TransactionContext => {
  const text = [params.institution, params.accountName, params.merchantRaw, params.merchantClean, params.description]
    .map(normalizeText)
    .filter(Boolean)
    .join(" ");
  const explicitCurrency = String(params.currency ?? "").trim().toUpperCase() || null;
  const matches = entries
    .map((entry) => ({
      entry,
      alias: entry.aliases.find((candidate) => matchesAlias(text, candidate)),
    }))
    .filter((match): match is { entry: ContextEntry; alias: string } => {
      if (!match.alias) return false;
      return !(match.entry.negativeAliases ?? []).some((alias) => matchesAlias(text, alias));
    })
    .sort((left, right) => {
      const lengthDifference = right.alias.length - left.alias.length;
      return lengthDifference !== 0 ? lengthDifference : right.entry.confidence - left.entry.confidence;
    });

  if (matches.length === 0) {
    return {
      corpusVersion: CONTEXT_CORPUS_VERSION,
      countryCode: null,
      regionCode: null,
      paymentRail: null,
      institutionType: null,
      currency: explicitCurrency,
      categoryHint: null,
      transactionTypeHint: null,
      ...emptyParsingContext,
      travelLikely: false,
      foreignCurrencyLikely: false,
      contextStatus: "unmatched",
      matchedEntryIds: [],
      fieldConfidence: { countryCode: 0, regionCode: 0, paymentRail: 0, institutionType: 0, currency: explicitCurrency ? 55 : 0, categoryHint: 0, transactionTypeHint: 0 },
      signals: explicitCurrency ? [{ id: "explicit-currency", kind: "currency", value: explicitCurrency, confidence: 55, evidence: `currency:${explicitCurrency}`, source: "curated", reviewStatus: "active" }] : [],
      confidence: explicitCurrency ? 55 : 0,
      evidence: explicitCurrency ? [`currency:${explicitCurrency}`] : [],
    };
  }

  const matched = matches[0].entry;
  const strongestMatches = matches.filter(({ entry }) => entry.confidence >= matched.confidence - 8);
  const distinctCountries = new Set(strongestMatches.map(({ entry }) => entry.countryCode).filter((value) => value !== "GLOBAL"));
  const distinctRails = new Set(strongestMatches.map(({ entry }) => entry.paymentRail).filter(Boolean));
  const ambiguous = distinctCountries.size > 1 || distinctRails.size > 1;
  const evidence = strongestMatches.map(({ alias }) => `alias:${alias}`);
  const signals: ContextSignal[] = strongestMatches.map(({ entry, alias }) => ({
    id: entry.id,
    kind: entry.signalKind ?? "merchant",
    value: entry.paymentRail ?? entry.categoryHint ?? entry.id,
    confidence: entry.confidence,
    evidence: `alias:${alias}`,
    source: entry.source ?? "curated",
    reviewStatus: entry.reviewStatus ?? "active",
  }));
  if (explicitCurrency) {
    evidence.push(`currency:${explicitCurrency}`);
    signals.push({ id: "explicit-currency", kind: "currency", value: explicitCurrency, confidence: 65, evidence: `currency:${explicitCurrency}`, source: "curated", reviewStatus: "active" });
  }
  const sameCurrency = !explicitCurrency || !matched.currency || explicitCurrency === matched.currency;
  const resolvedCountry = ambiguous || matched.countryCode === "GLOBAL" ? null : matched.countryCode;
  const resolvedRegion = ambiguous || matched.regionCode === "GLOBAL" ? null : matched.regionCode;
  const resolvedRail = ambiguous ? null : matched.paymentRail ?? null;
  const resolvedCategory = ambiguous ? null : matched.categoryHint ?? null;
  const resolvedType = ambiguous ? null : matched.transactionTypeHint ?? null;
  const baseConfidence = ambiguous ? Math.min(74, matched.confidence) : matched.confidence;
  const parsingProfile = getRegionalProfile(resolvedCountry);
  return {
    corpusVersion: CONTEXT_CORPUS_VERSION,
    countryCode: resolvedCountry,
    regionCode: resolvedRegion,
    paymentRail: resolvedRail,
    institutionType: matched.institutionType ?? null,
    currency: explicitCurrency ?? matched.currency ?? null,
    categoryHint: resolvedCategory,
    transactionTypeHint: resolvedType,
    primaryLocale: parsingProfile?.primaryLocale ?? null,
    dateOrder: parsingProfile?.dateOrder ?? "unknown",
    decimalSeparator: parsingProfile?.decimalSeparator ?? null,
    groupingSeparator: parsingProfile?.groupingSeparator ?? null,
    languages: parsingProfile?.languages ?? [],
    legalEntitySuffixes: parsingProfile?.legalEntitySuffixes ?? [],
    parsingProfileConfidence: parsingProfile?.confidence ?? 0,
    travelLikely: strongestMatches.some(({ entry }) => entry.travelLikely),
    foreignCurrencyLikely: strongestMatches.some(({ entry }) => entry.foreignCurrencyLikely) || Boolean(explicitCurrency && matched.currency && explicitCurrency !== matched.currency),
    contextStatus: ambiguous ? "ambiguous" : "matched",
    matchedEntryIds: strongestMatches.map(({ entry }) => entry.id),
    fieldConfidence: {
      countryCode: resolvedCountry ? baseConfidence : 0,
      regionCode: resolvedRegion ? baseConfidence : 0,
      paymentRail: resolvedRail ? baseConfidence : 0,
      institutionType: matched.institutionType ? baseConfidence : 0,
      currency: explicitCurrency ? (sameCurrency ? 96 : 70) : matched.currency ? 82 : 0,
      categoryHint: resolvedCategory ? baseConfidence : 0,
      transactionTypeHint: resolvedType ? baseConfidence : 0,
    },
    signals,
    confidence: Math.min(99, baseConfidence + (explicitCurrency && sameCurrency ? 1 : 0)),
    evidence,
  };
};

export const getRegionalParsingProfile = (countryCode?: string | null) => {
  const profile = getRegionalProfile(countryCode);
  return profile ? { ...profile, locales: [...profile.locales], languages: [...profile.languages], legalEntitySuffixes: [...profile.legalEntitySuffixes] } : null;
};

const makeValidUtcDate = (year: number, month: number, day: number) => {
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
};

export const parseRegionalDateValue = (value: string | null | undefined, countryCode?: string | null) => {
  const profile = getRegionalProfile(countryCode);
  if (!profile || profile.dateOrder === "unknown" || !value) return null;
  const match = String(value).trim().match(/^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})$/);
  if (!match) return null;
  let first = Number(match[1]);
  let second = Number(match[2]);
  let third = Number(match[3]);
  const year = first >= 1000 ? first : third >= 1000 ? third : third + (third >= 70 ? 1900 : 2000);
  if (first >= 1000) {
    return makeValidUtcDate(year, second, third);
  }
  if (profile.dateOrder === "dmy") return makeValidUtcDate(year, second, first);
  if (profile.dateOrder === "mdy") return makeValidUtcDate(year, first, second);
  return makeValidUtcDate(year, first, second);
};

export const parseRegionalAmountValue = (value: string | number | null | undefined, countryCode?: string | null) => {
  const profile = getRegionalProfile(countryCode);
  if (!profile || value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value).trim();
  const negative = /^\s*-/.test(raw) || /^\s*\(/.test(raw);
  let cleaned = raw.replace(/\u00a0/g, " ").replace(/[^0-9,\.\s]/g, "").replace(/\s+/g, "");
  if (!cleaned) return null;
  if (profile.decimalSeparator === ",") {
    cleaned = cleaned.replace(/\./g, "").replace(/,/g, ".");
  } else {
    cleaned = cleaned.replace(/,/g, "");
  }
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -Math.abs(parsed) : parsed;
};

export const getContextCorpusEntries = () => entries.map((entry) => ({
  ...entry,
  aliases: [...entry.aliases],
  negativeAliases: [...(entry.negativeAliases ?? [])],
  source: entry.source ?? "curated",
  reviewStatus: entry.reviewStatus ?? "active",
}));

export const getContextCorpusQualityReport = () => {
  const ids = entries.map((entry) => entry.id);
  const aliasOwners = new Map<string, string[]>();
  for (const entry of entries) {
    for (const alias of entry.aliases) {
      const normalizedAlias = normalizeText(alias);
      const owners = aliasOwners.get(normalizedAlias) ?? [];
      owners.push(entry.id);
      aliasOwners.set(normalizedAlias, owners);
    }
  }
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  const duplicateAliases = [...aliasOwners.entries()]
    .filter(([, owners]) => new Set(owners).size > 1)
    .map(([alias]) => alias);
  const invalidEntries = entries.filter((entry) =>
    !entry.id ||
    entry.aliases.length === 0 ||
    entry.aliases.some((alias) => !normalizeText(alias)) ||
    entry.confidence < 0 ||
    entry.confidence > 100
  );
  const profileCodes = regionalProfiles.map((profile) => profile.countryCode);
  const duplicateProfiles = profileCodes.filter((code, index) => profileCodes.indexOf(code) !== index);
  return {
    entryCount: entries.length,
    profileCount: regionalProfiles.length,
    duplicateIds: [...new Set(duplicateIds)],
    duplicateAliases: [...new Set(duplicateAliases)],
    invalidEntryIds: invalidEntries.map((entry) => entry.id),
    duplicateProfiles: [...new Set(duplicateProfiles)],
    valid: duplicateIds.length === 0 && duplicateAliases.length === 0 && invalidEntries.length === 0 && duplicateProfiles.length === 0,
  };
};
