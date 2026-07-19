/**
 * Versioned context corpus for transaction normalization.
 *
 * This corpus provides evidence and hints; it must not replace a user's
 * confirmed transaction values. Keep raw statement text outside this module.
 */

export const CONTEXT_CORPUS_VERSION = "2026.07.2";

export type ContextSignal = {
  id: string;
  kind: "institution" | "payment_rail" | "travel" | "fee" | "currency" | "merchant";
  value: string;
  confidence: number;
  evidence: string;
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
};

const entries: ContextEntry[] = [
  // Philippines: launch market and strongest deterministic context.
  { id: "ph-gcash", aliases: ["gcash", "g-xchange", "gcash cash in", "gcash cash out"], signalKind: "payment_rail", countryCode: "PH", regionCode: "SEA", paymentRail: "gcash", institutionType: "wallet", currency: "PHP", transactionTypeHint: "transfer", confidence: 96 },
  { id: "ph-maya", aliases: ["maya", "maya wallet", "paymaya", "maya bank"], signalKind: "payment_rail", countryCode: "PH", regionCode: "SEA", paymentRail: "maya", institutionType: "wallet", currency: "PHP", transactionTypeHint: "transfer", confidence: 94 },
  { id: "ph-bank-transfer", aliases: ["instapay", "insta pay", "pesonet", "pesonet transfer"], signalKind: "payment_rail", countryCode: "PH", regionCode: "SEA", paymentRail: "philippines_bank_transfer", currency: "PHP", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 98 },
  { id: "ph-bpi", aliases: ["bpi", "bank of the philippine islands"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 98 },
  { id: "ph-bdo", aliases: ["bdo", "banco de oro"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 98 },
  { id: "ph-unionbank", aliases: ["unionbank", "union bank of the philippines"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 98 },

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
  { aliases: ["upi", "upi collect", "imps", "neft", "rtgs india"], countryCode: "IN", regionCode: "SAS", paymentRail: "india_bank_rail", currency: "INR", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 94 },
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
];

const normalizeText = (value: unknown) =>
  String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const matchesAlias = (text: string, alias: string) => {
  const normalizedAlias = normalizeText(alias);
  return normalizedAlias.length > 0 && (text === normalizedAlias || text.includes(normalizedAlias));
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
      travelLikely: false,
      foreignCurrencyLikely: false,
      contextStatus: "unmatched",
      matchedEntryIds: [],
      fieldConfidence: { countryCode: 0, regionCode: 0, paymentRail: 0, institutionType: 0, currency: explicitCurrency ? 55 : 0, categoryHint: 0, transactionTypeHint: 0 },
      signals: explicitCurrency ? [{ id: "explicit-currency", kind: "currency", value: explicitCurrency, confidence: 55, evidence: `currency:${explicitCurrency}` }] : [],
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
  }));
  if (explicitCurrency) {
    evidence.push(`currency:${explicitCurrency}`);
    signals.push({ id: "explicit-currency", kind: "currency", value: explicitCurrency, confidence: 65, evidence: `currency:${explicitCurrency}` });
  }
  const sameCurrency = !explicitCurrency || !matched.currency || explicitCurrency === matched.currency;
  const resolvedCountry = ambiguous || matched.countryCode === "GLOBAL" ? null : matched.countryCode;
  const resolvedRegion = ambiguous || matched.regionCode === "GLOBAL" ? null : matched.regionCode;
  const resolvedRail = ambiguous ? null : matched.paymentRail ?? null;
  const resolvedCategory = ambiguous ? null : matched.categoryHint ?? null;
  const resolvedType = ambiguous ? null : matched.transactionTypeHint ?? null;
  const baseConfidence = ambiguous ? Math.min(74, matched.confidence) : matched.confidence;
  return {
    corpusVersion: CONTEXT_CORPUS_VERSION,
    countryCode: resolvedCountry,
    regionCode: resolvedRegion,
    paymentRail: resolvedRail,
    institutionType: matched.institutionType ?? null,
    currency: explicitCurrency ?? matched.currency ?? null,
    categoryHint: resolvedCategory,
    transactionTypeHint: resolvedType,
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

export const getContextCorpusEntries = () => entries.map((entry) => ({ ...entry, aliases: [...entry.aliases], negativeAliases: [...(entry.negativeAliases ?? [])] }));
