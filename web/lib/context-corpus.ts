/**
 * Versioned context corpus for transaction normalization.
 *
 * This corpus provides evidence and hints; it must not replace a user's
 * confirmed transaction values. Keep raw statement text outside this module.
 */

export const CONTEXT_CORPUS_VERSION = "2026.07.1";

export type TransactionContext = {
  corpusVersion: string;
  countryCode: string | null;
  regionCode: string | null;
  paymentRail: string | null;
  institutionType: string | null;
  currency: string | null;
  categoryHint: string | null;
  transactionTypeHint: "income" | "expense" | "transfer" | null;
  confidence: number;
  evidence: string[];
};

type ContextEntry = {
  aliases: string[];
  countryCode: string;
  regionCode: string;
  paymentRail?: string;
  institutionType?: string;
  currency?: string;
  categoryHint?: string;
  transactionTypeHint?: TransactionContext["transactionTypeHint"];
  confidence: number;
};

const entries: ContextEntry[] = [
  // Philippines: launch market and strongest deterministic context.
  { aliases: ["gcash", "g-xchange", "gcash cash in", "gcash cash out"], countryCode: "PH", regionCode: "SEA", paymentRail: "gcash", institutionType: "wallet", currency: "PHP", transactionTypeHint: "transfer", confidence: 96 },
  { aliases: ["maya", "maya wallet", "paymaya", "maya bank"], countryCode: "PH", regionCode: "SEA", paymentRail: "maya", institutionType: "wallet", currency: "PHP", transactionTypeHint: "transfer", confidence: 94 },
  { aliases: ["instapay", "insta pay", "pesonet", "pesonet transfer"], countryCode: "PH", regionCode: "SEA", paymentRail: "philippines_bank_transfer", currency: "PHP", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 98 },
  { aliases: ["bpi", "bank of the philippine islands"], countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 98 },
  { aliases: ["bdo", "banco de oro"], countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 98 },
  { aliases: ["unionbank", "union bank of the philippines"], countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 98 },

  // Southeast Asia expansion packs.
  { aliases: ["paynow", "fast transfer", "fast payments"], countryCode: "SG", regionCode: "SEA", paymentRail: "paynow_fast", currency: "SGD", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 96 },
  { aliases: ["duitnow", "instant transfer malaysia"], countryCode: "MY", regionCode: "SEA", paymentRail: "duitnow", currency: "MYR", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 96 },
  { aliases: ["qris", "bi-fast", "bifast"], countryCode: "ID", regionCode: "SEA", paymentRail: "qris_bi_fast", currency: "IDR", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 94 },
  { aliases: ["promptpay", "พร้อมเพย์"], countryCode: "TH", regionCode: "SEA", paymentRail: "promptpay", currency: "THB", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 96 },
  { aliases: ["napas", "vietqr", "viet qr"], countryCode: "VN", regionCode: "SEA", paymentRail: "napas_vietqr", currency: "VND", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 92 },

  // Travel-heavy East Asia context.
  { aliases: ["suica", "pasmo", "icoca", "jr east", "jr central"], countryCode: "JP", regionCode: "EAS", paymentRail: "japan_transit", currency: "JPY", categoryHint: "Transport", transactionTypeHint: "expense", confidence: 92 },
  { aliases: ["octopus", "alipay hk", "fps hong kong", "faster payment system"], countryCode: "HK", regionCode: "EAS", paymentRail: "hong_kong_fps", currency: "HKD", categoryHint: "Transfers", confidence: 90 },
  { aliases: ["line pay taiwan", "jko pay", "jkopay", "easycard"], countryCode: "TW", regionCode: "EAS", paymentRail: "taiwan_wallet", currency: "TWD", confidence: 88 },

  // Diaspora and international-account context.
  { aliases: ["upi", "upi collect", "imps", "neft", "rtgs india"], countryCode: "IN", regionCode: "SAS", paymentRail: "india_bank_rail", currency: "INR", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 94 },
  { aliases: ["uae exchange", "al ansari exchange", "lu lu exchange", "remittance"], countryCode: "AE", regionCode: "MEA", paymentRail: "remittance", currency: "AED", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 86 },
  { aliases: ["sepa", "sepa direct debit", "iban transfer"], countryCode: "EU", regionCode: "EUR", paymentRail: "sepa", currency: "EUR", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 92 },
  { aliases: ["ach", "zelle", "venmo", "cash app"], countryCode: "US", regionCode: "NAM", paymentRail: "us_ach_wallet", currency: "USD", confidence: 88 },
  { aliases: ["faster payments", "bacs", "chaps", "direct debit uk"], countryCode: "GB", regionCode: "EUR", paymentRail: "uk_bank_rail", currency: "GBP", confidence: 90 },
  { aliases: ["payid", "osko", "bp​​ay", "bpay"], countryCode: "AU", regionCode: "OCE", paymentRail: "australia_bank_rail", currency: "AUD", confidence: 88 },

  // Global providers and cross-border context.
  { aliases: ["wise", "wise transfer", "transferwise"], countryCode: "GLOBAL", regionCode: "GLOBAL", paymentRail: "cross_border_transfer", institutionType: "fintech", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 96 },
  { aliases: ["paypal"], countryCode: "GLOBAL", regionCode: "GLOBAL", paymentRail: "paypal", institutionType: "wallet", confidence: 94 },
  { aliases: ["visa", "mastercard", "american express", "amex"], countryCode: "GLOBAL", regionCode: "GLOBAL", institutionType: "card_network", confidence: 82 },
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
  const matched = entries
    .filter((entry) => entry.aliases.some((alias) => matchesAlias(text, alias)))
    .sort((left, right) => right.confidence - left.confidence)[0];

  if (!matched) {
    return {
      corpusVersion: CONTEXT_CORPUS_VERSION,
      countryCode: null,
      regionCode: null,
      paymentRail: null,
      institutionType: null,
      currency: explicitCurrency,
      categoryHint: null,
      transactionTypeHint: null,
      confidence: explicitCurrency ? 55 : 0,
      evidence: explicitCurrency ? [`currency:${explicitCurrency}`] : [],
    };
  }

  const evidence = [`alias:${matched.aliases.find((alias) => matchesAlias(text, alias)) ?? matched.aliases[0]}`];
  if (explicitCurrency) evidence.push(`currency:${explicitCurrency}`);
  return {
    corpusVersion: CONTEXT_CORPUS_VERSION,
    countryCode: matched.countryCode === "GLOBAL" ? null : matched.countryCode,
    regionCode: matched.regionCode === "GLOBAL" ? null : matched.regionCode,
    paymentRail: matched.paymentRail ?? null,
    institutionType: matched.institutionType ?? null,
    currency: explicitCurrency ?? matched.currency ?? null,
    categoryHint: matched.categoryHint ?? null,
    transactionTypeHint: matched.transactionTypeHint ?? null,
    confidence: Math.min(99, matched.confidence + (explicitCurrency && matched.currency === explicitCurrency ? 1 : 0)),
    evidence,
  };
};

export const getContextCorpusEntries = () => entries.map((entry) => ({ ...entry, aliases: [...entry.aliases] }));
