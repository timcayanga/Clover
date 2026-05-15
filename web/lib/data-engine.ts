import { Prisma } from "@prisma/client";
import type { AccountType, TransactionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { capturePostHogServerEvent } from "@/lib/analytics";
import {
  detectStatementMetadata,
  type DetectedStatementMetadata,
  type ImportedAccountType,
  inferAccountTypeFromStatement,
  isStandaloneCashPaymentDescription,
  isStatementPaymentSettlementDescription,
  normalizeInstitutionCurrency,
  parseAmountValue,
  parseDateValue,
  type ParsedImportRow,
} from "@/lib/import-parser";
import { sanitizeBankNameLabel } from "@/lib/data-qa-banks";
import { summarizeMerchantText } from "@/lib/merchant-labels";
import { coerceTransactionTypeFromCategoryName, toInternalTransactionType } from "@/lib/transaction-directions";

export const DATA_ENGINE_VERSION = "v2";

type TrainingSignalRow = {
  categoryId: string;
  categoryName: string | null;
  merchantKey: string;
  merchantTokens: string[];
  type: TransactionType;
  source: string;
  confidence: number;
};

type NegativeMerchantSignalRow = {
  merchantKey: string;
  merchantTokens: string[];
  source: string;
  confidence: number;
};

type MerchantRuleRow = {
  merchantKey: string;
  merchantPattern: string | null;
  normalizedName: string;
  categoryId: string | null;
  categoryName: string | null;
  source: string;
  confidence: number;
  timesConfirmed: number;
};

type AccountRuleRow = {
  ruleKey: string;
  accountId: string | null;
  accountName: string;
  institution: string | null;
  accountType: AccountType;
  source: string;
  confidence: number;
  timesConfirmed: number;
};

type StatementTemplateRow = {
  fingerprint: string;
  fileType: string | null;
  institution: string | null;
  accountNumber: string | null;
  accountName: string | null;
  parserVersion: string;
  parserConfig: Prisma.JsonValue | null;
  metadata: Prisma.JsonValue | null;
  exampleCount: number;
  successCount: number;
  failureCount: number;
  lastSeenAt: Date;
};

export type EnrichedParsedImportRow = ParsedImportRow & {
  institution?: string | null;
  accountNumber?: string | null;
  statementFingerprint?: string | null;
  parserVersion?: string;
  confidence?: number;
  categoryReason?: string | null;
  reviewStatus?: "pending_review" | "suggested" | "confirmed" | "edited" | "rejected" | "duplicate_skipped";
  parserConfidence?: number;
  categoryConfidence?: number;
  accountMatchConfidence?: number;
  duplicateConfidence?: number;
  transferConfidence?: number;
  rowShapeConfidence?: number;
  rowTeachabilityConfidence?: number;
  rawPayload?: Prisma.InputJsonValue | null;
  normalizedPayload?: Prisma.InputJsonValue | null;
  learnedRuleIdsApplied?: Prisma.InputJsonValue | null;
};

const COMMON_STOP_WORDS = new Set([
  "and",
  "the",
  "for",
  "from",
  "with",
  "payment",
  "pay",
  "card",
  "debit",
  "credit",
  "transfer",
  "bank",
  "online",
  "pos",
  "inc",
  "corp",
  "co",
  "ltd",
  "llc",
  "ph",
]);

const CATEGORY_FALLBACKS: Record<TransactionType, string> = {
  income: "Income",
  expense: "Other",
  transfer: "Transfers",
};

const KNOWN_INSTITUTIONS: Array<{ name: string; match: RegExp }> = [
  { name: "BPI", match: /\b(BANK OF THE PHILIPPINE ISLANDS|BPI)\b/i },
  { name: "BDO", match: /\b(BDO|BANCO DE ORO)\b/i },
  { name: "Metrobank", match: /\b(METROBANK|METROPOLITAN BANK)\b/i },
  { name: "Security Bank", match: /\bSECURITY BANK\b/i },
  { name: "EastWest", match: /\b(EASTWEST|EAST WEST)\b/i },
  { name: "CIMB", match: /\b(CIMB|GSAVE)\b/i },
  { name: "RCBC", match: /\bRCBC\b/i },
  { name: "UnionBank", match: /\bUNIONBANK\b/i },
  { name: "Landbank", match: /\bLANDBANK\b/i },
  { name: "Chinabank", match: /\b(CHINABANK|CHINA\s*BANK)\b/i },
  { name: "MariBank", match: /\b(MARIBANK|SEABANK)\b/i },
  { name: "PSBank", match: /\bPSBANK\b/i },
  { name: "UCPB", match: /\b(UCPB|UNITED\s+COCONUT\s+PLANTERS\s+BANK)\b/i },
  { name: "Maya", match: /\bMAYA\b/i },
  { name: "GCash", match: /\bGCASH\b/i },
  { name: "Wise", match: /\bWISE\b/i },
  { name: "PayPal", match: /\bPAYPAL\b/i },
];

const PARSED_TRANSACTION_COLUMNS = [
  "id",
  "importFileId",
  "workspaceId",
  "institution",
  "accountNumber",
  "accountName",
  "date",
  "amount",
  "currency",
  "merchantRaw",
  "merchantClean",
  "type",
  "categoryName",
  "confidence",
  "categoryReason",
  "parserVersion",
  "statementFingerprint",
  "rawPayload",
  "createdAt",
] as const;

const STATEMENT_TEMPLATE_COLUMNS = [
  "id",
  "workspaceId",
  "fingerprint",
  "fileType",
  "institution",
  "accountNumber",
  "accountName",
  "parserVersion",
  "parserConfig",
  "exampleCount",
  "successCount",
  "failureCount",
  "lastSeenAt",
  "metadata",
  "createdAt",
  "updatedAt",
] as const;

const DOCUMENT_IMPORT_COLUMNS = [
  "id",
  "workspaceId",
  "importFileId",
  "accountId",
  "documentFamily",
  "documentSubtype",
  "institution",
  "accountName",
  "accountNumber",
  "currency",
  "pageCount",
  "confidence",
  "sourceMetadata",
  "rawPayload",
  "extractedPayload",
  "createdAt",
  "updatedAt",
] as const;

const DOCUMENT_IMPORT_PAGE_COLUMNS = [
  "id",
  "documentImportId",
  "pageNumber",
  "imageName",
  "pageType",
  "visibleTitle",
  "visibleDate",
  "visibleCurrency",
  "rawOcrText",
  "layoutNotes",
  "confidence",
  "rawPayload",
  "createdAt",
  "updatedAt",
] as const;

const RECEIPT_DOCUMENT_COLUMNS = [
  "id",
  "workspaceId",
  "documentImportId",
  "accountId",
  "transactionId",
  "merchantRaw",
  "merchantClean",
  "transactionDate",
  "transactionTime",
  "currency",
  "subtotal",
  "tax",
  "total",
  "paymentMethod",
  "accountMatch",
  "confidence",
  "rawPayload",
  "createdAt",
  "updatedAt",
] as const;

const INVESTMENT_SNAPSHOT_COLUMNS = [
  "id",
  "workspaceId",
  "documentImportId",
  "accountId",
  "snapshotDate",
  "portfolioName",
  "currency",
  "totalValue",
  "costBasis",
  "gainLossValue",
  "gainLossPercent",
  "confidence",
  "rawPayload",
  "createdAt",
  "updatedAt",
] as const;

const INVESTMENT_HOLDING_COLUMNS = [
  "id",
  "workspaceId",
  "investmentSnapshotId",
  "documentImportId",
  "accountId",
  "rowIndex",
  "assetName",
  "assetSymbol",
  "assetType",
  "quantity",
  "unitPrice",
  "costBasis",
  "marketValue",
  "currentValue",
  "gainLossValue",
  "gainLossPercent",
  "currency",
  "status",
  "confidence",
  "rawPayload",
  "createdAt",
  "updatedAt",
] as const;

const RECURRING_PATTERN_COLUMNS = [
  "id",
  "workspaceId",
  "documentImportId",
  "accountId",
  "merchantRaw",
  "merchantClean",
  "amount",
  "currency",
  "frequency",
  "firstSeenDate",
  "lastSeenDate",
  "nextExpectedDate",
  "transactionCount",
  "confidence",
  "rawPayload",
  "createdAt",
  "updatedAt",
] as const;

const MERCHANT_RULE_COLUMNS = [
  "id",
  "workspaceId",
  "merchantKey",
  "merchantPattern",
  "normalizedName",
  "categoryId",
  "categoryName",
  "source",
  "confidence",
  "timesConfirmed",
  "lastUsedAt",
  "createdAt",
  "updatedAt",
] as const;

const ACCOUNT_RULE_COLUMNS = [
  "id",
  "workspaceId",
  "accountId",
  "ruleKey",
  "accountName",
  "institution",
  "accountType",
  "source",
  "confidence",
  "timesConfirmed",
  "lastUsedAt",
  "createdAt",
  "updatedAt",
] as const;

const IMPORT_FILE_COLUMNS = [
  "id",
  "workspaceId",
  "accountId",
  "fileName",
  "fileType",
  "storageKey",
  "status",
  "processingPhase",
  "processingMessage",
  "processingAttempt",
  "processingTargetScore",
  "processingCurrentScore",
  "parsedRowsCount",
  "confirmedTransactionsCount",
  "confirmedAt",
  "uploadedAt",
  "deletedAt",
  "createdAt",
  "updatedAt",
] as const;

const TRAINING_SIGNAL_COLUMNS = [
  "id",
  "workspaceId",
  "importFileId",
  "transactionId",
  "source",
  "merchantKey",
  "dedupeKey",
  "merchantTokens",
  "categoryId",
  "categoryName",
  "type",
  "confidence",
  "notes",
  "createdAt",
] as const;

const TRANSACTION_COLUMNS = [
  "id",
  "workspaceId",
  "accountId",
  "importFileId",
  "categoryId",
  "reviewStatus",
  "parserConfidence",
  "categoryConfidence",
  "accountMatchConfidence",
  "duplicateConfidence",
  "transferConfidence",
  "rawPayload",
  "normalizedPayload",
  "learnedRuleIdsApplied",
  "date",
  "amount",
  "currency",
  "type",
  "merchantRaw",
  "merchantClean",
  "description",
  "isTransfer",
  "isExcluded",
  "deletedAt",
  "createdAt",
  "updatedAt",
] as const;

const fnv1a = (value: string) => {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
};

const normalizeWhitespace = (value: string) => value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

export const normalizeAccountRuleKey = (accountName?: string | null, institution?: string | null) =>
  normalizeMerchantText(
    `${institution ?? ""} ${extractLastFourDigits(accountName) ?? normalizeWhitespace(String(accountName ?? ""))}`
  );

export const extractLastFourDigits = (value?: string | null) => {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, "");
  if (digits.length < 4) return null;
  return digits.slice(-4);
};

const getHardcodedCategoryOverride = (merchantText: string) => {
  const lower = merchantText.toLowerCase();
  const compact = normalizeWhitespace(merchantText).replace(/\s+/g, "").toLowerCase();

  if (isStandaloneCashPaymentDescription(merchantText)) {
    return "Shopping";
  }

  if (
    /incoming\s+(?:interbank\s+)?transfer|outgoing\s+(?:interbank\s+)?transfer|fund\s+transfer|interbank\s+fund\s+transfer|system\s+(?:debit|credit)|miscellaneous\s+debit|investment\s+sweep|card\s+payment|payment\s*-\s*thank\s+you/.test(lower) ||
    /incoming(?:interbank)?transfer|outgoing(?:interbank)?transfer|fundtransfer|interbankfundtransfer|system(?:debit|credit)|miscellaneousdebit|investmentsweep|cardpayment|paymentthankyou/.test(compact) ||
    isStatementPaymentSettlementDescription(merchantText)
  ) {
    return "Transfers";
  }

  if (
    /atm\s+withdrawal|atm\s+withdrawal\s+acquirer\s+fee|cash\s+withdrawal|cash\s+out|expressnet|megalink/.test(lower) ||
    /atmwithdrawal|atmwithdrawalacquirerfee|cashwithdrawal|cashout|expressnet|megalink/.test(compact)
  ) {
    return "Cash & ATM";
  }

  if (/office\s*365|google\s+one/.test(lower) || /office365|googleone/.test(compact)) {
    return "Business";
  }

  if (/discord\s+nitro|mlbb\s+top\s+up|mlbbtopup|foodpanda\s+ph|foodpanda/.test(lower) || /discordnitro|mlbbtopup|foodpandaph/.test(compact)) {
    return /foodpanda/.test(lower) || /foodpandaph/.test(compact) ? "Food & Dining" : "Shopping";
  }

  if (/taxwithheld|withheldtax|tax withheld|withheld tax/.test(lower) || /taxwithheld|withheldtax/.test(compact)) {
    return "Financial";
  }

  if (/interest\s+earned|base\s+interest|boost\s+interest|cash\/?check\s+deposit/.test(lower) || /interestearned|baseinterest|boostinterest|cashcheckdeposit/.test(compact)) {
    return "Income";
  }

  if (/instapay\s*transfer\s*fee|instapaytransferfee/.test(lower) || /instapaytransferfee/.test(compact)) {
    return "Financial";
  }

  if (
    /repayment|transfer\s+to\s+wallet|credit\s+drawdown/.test(lower) ||
    /repayment|transfertowallet|creditdrawdown/.test(compact)
  ) {
    return "Transfers";
  }

  if (
    /service\s+charge|service\s+fee|interbank\s+service\s+charge|bank\s+charge|finance\s+charges?|late\s+payment\s+fee|annual\s+fee|penalty\s+fee|late\s+penalty|documentary\s+stamp\s+tax|\bdst\b/.test(lower) ||
    /servicecharge|servicefee|interbankservicecharge|bankcharge|financecharges?|latepaymentfee|annualfee|penaltyfee|latepenalty|documentarystamptax|dst/.test(compact)
  ) {
    return "Financial";
  }

  return null;
};

const HARDCODED_EXACT_MERCHANT_KEYS = new Set([
  "deposit",
  "withdrawal",
  "atm withdrawal",
  "transfer fee",
  "base interest",
  "boost interest",
  "tax withheld",
  "cash payment",
  "repayment",
  "credit drawdown",
  "service fee",
  "penalty fee",
  "documentary stamp tax",
]);

export const normalizeMerchantText = (value?: string | null) =>
  normalizeWhitespace(String(value ?? ""))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const tokenizeMerchant = (value?: string | null) =>
  normalizeMerchantText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !COMMON_STOP_WORDS.has(token));

export const buildMerchantPrototypeLabel = (merchantText: string, normalizedName?: string | null) => {
  const base = summarizeMerchantText(merchantText);
  const normalized = normalizeMerchantText(normalizedName ?? merchantText);
  const prototype = normalizeWhitespace(base).trim();

  if (!prototype) {
    return null;
  }

  if (prototype.length < 4) {
    return null;
  }

  if (normalizeMerchantText(prototype) === normalized) {
    return null;
  }

  if (/^(?:bank transfer|cash payment|atm withdrawal|credit card payment|service charge|documentary stamp tax)$/i.test(prototype)) {
    return null;
  }

  return prototype;
};

export const assessParsedRowShapeConsistency = (rows: ParsedImportRow[]) => {
  const total = rows.length;
  if (total === 0) {
    return {
      score: 0,
      dateCoverage: 0,
      amountCoverage: 0,
      merchantCoverage: 0,
      typeCoverage: 0,
      issues: ["empty_rows"],
    };
  }

  const parseableDateCount = rows.filter((row) => Boolean(parseDateValue(typeof row.date === "string" ? row.date : null))).length;
  const amountCount = rows.filter((row) => Number.isFinite(Number(row.amount ?? NaN))).length;
  const merchantCount = rows.filter((row) => {
    const value = String(row.merchantClean ?? row.merchantRaw ?? row.description ?? "").trim();
    return value.length >= 2;
  }).length;
  const typeCount = rows.filter((row) => row.type === "income" || row.type === "expense" || row.type === "transfer").length;
  const dateCoverage = parseableDateCount / total;
  const amountCoverage = amountCount / total;
  const merchantCoverage = merchantCount / total;
  const typeCoverage = typeCount / total;

  const issues: string[] = [];
  if (dateCoverage < 0.65) issues.push("date_coverage");
  if (amountCoverage < 0.9) issues.push("amount_coverage");
  if (merchantCoverage < 0.75) issues.push("merchant_coverage");
  if (typeCoverage < 0.8) issues.push("type_coverage");

  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(dateCoverage * 35 + amountCoverage * 30 + merchantCoverage * 20 + typeCoverage * 15 - Math.max(0, issues.length - 1) * 8)
    )
  );

  return {
    score,
    dateCoverage,
    amountCoverage,
    merchantCoverage,
    typeCoverage,
    issues,
  };
};

export const scoreRowShapeLearningPenalty = (score: number) => {
  const normalizedScore = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
  if (normalizedScore >= 85) {
    return 0;
  }

  if (normalizedScore >= 70) {
    return 4;
  }

  if (normalizedScore >= 55) {
    return 10;
  }

  return 16;
};

export const assessParsedRowTeachability = (row: ParsedImportRow) => {
  const assessment = assessParsedRowShapeConsistency([row]);
  const merchantText = String(row.merchantClean ?? row.merchantRaw ?? row.description ?? "").trim();
  const amount = Number(row.amount ?? NaN);
  const hasMerchant = merchantText.length >= 2 && !/^(?:\?+|n\/a|null|undefined)$/i.test(merchantText);
  const hasAmount = Number.isFinite(amount);
  const hasType = row.type === "income" || row.type === "expense" || row.type === "transfer";
  const hasDate = Boolean(parseDateValue(typeof row.date === "string" ? row.date : null));
  const suspiciousTokens = /(?:\b(?:page|continued|statement|summary|account details)\b|^[^A-Za-z0-9]+$|[^\w\s]{4,})/i.test(merchantText);
  const score = Math.max(
    0,
    Math.min(
      100,
      assessment.score + (hasMerchant ? 10 : -20) + (hasAmount ? 10 : -25) + (hasType ? 8 : -12) + (hasDate ? 8 : -10) - (suspiciousTokens ? 15 : 0)
    )
  );
  const issues = [...assessment.issues];
  if (!hasMerchant) issues.push("merchant_missing");
  if (!hasAmount) issues.push("amount_missing");
  if (!hasDate) issues.push("date_missing");
  if (!hasType) issues.push("type_missing");
  if (suspiciousTokens) issues.push("merchant_noise");

  return {
    score,
    issues,
    hasMerchant,
    hasAmount,
    hasDate,
    hasType,
  };
};

export const shouldPromoteTrainingSignalForLearning = (params: {
  confidence?: number | null;
  teachabilityScore?: number | null;
  merchantText?: string | null;
}) => {
  const confidence = typeof params.confidence === "number" && Number.isFinite(params.confidence) ? Math.max(0, Math.min(100, Math.round(params.confidence))) : null;
  const teachabilityScore =
    typeof params.teachabilityScore === "number" && Number.isFinite(params.teachabilityScore)
      ? Math.max(0, Math.min(100, Math.round(params.teachabilityScore)))
      : null;
  const merchantText = String(params.merchantText ?? "").trim();
  if (!merchantText) {
    return false;
  }

  if (teachabilityScore !== null) {
    return teachabilityScore >= 55;
  }

  return (confidence ?? 0) >= 60;
};

export const buildTrainingSignalDedupeKey = (params: {
  source: "import_confirmation" | "manual_recategorization" | "training_upload" | "manual_transaction_creation";
  transactionId?: string | null;
  importFileId?: string | null;
  merchantKey: string;
  categoryId: string;
  type: TransactionType;
}) =>
  [
    params.source,
    params.transactionId ?? "",
    params.importFileId ?? "",
    params.merchantKey,
    params.categoryId,
    params.type,
  ].join("|");

export const guessCategoryFallback = (description: string, type: TransactionType) => {
  const lower = description.toLowerCase();
  const compact = normalizeWhitespace(description).replace(/\s+/g, "").toLowerCase();
  const override = getHardcodedCategoryOverride(description);
  if (override) return override;
  if (/transfer|instapay|pesonet|wise to|to savings|to checking|wa\s+(?:cr|db)|et\s+(?:cr|db)\s+ibft|st\s+(?:cm|dm)\s+gen|mo\s+dm/.test(lower)) return "Transfers";
  if (/expressnet|megalink|withdrawal|atm\b|cash withdrawal|cash out|atmwdl|atm withdrawal|et\s+wdl/.test(lower)) return "Cash & ATM";
  if (/service\s*charge|servicecharge|service\s*fee|bank\s*charge|bankcharge|svchg|finance\s+charges?|late\s+payment\s+fee|annual\s+fee/.test(lower)) return "Financial";
  if (/tax withheld|withheld tax|taxwithheld|withheldtax/.test(lower)) return "Financial";
  if (/interest\s+earned|interestearned|salary|payroll|income|deposit|cash\s*in\b|cashin\b|cash\/?check\s+deposit|received|credit memo/.test(lower)) return "Income";
  if (/interbankservicecharge|atmwithdrawalacquirerfee|financecharge|financecharges|latepaymentfee|annualfee/.test(compact)) return "Financial";
  if (/incominginterbanktransfer|outgoinginterbanktransfer|incomingtransfer|outgoingtransfer|fundtransfer|systemdebit|systemcredit|miscellaneousdebit|investmentsweep/.test(compact)) return "Transfers";
  if (/grocery|supermarket|market|food|dining|restaurant|coffee|cafe|meal|takeout/.test(lower)) return "Food & Dining";
  if (/grab|uber|taxi|bus|train|parking|gas|fuel|transport|ride/.test(lower)) return "Transport";
  if (/rent|mortgage|apartment|housing/.test(lower)) return "Housing";
  if (/bill|utilities|electric|water|internet|phone|subscription|openai|netflix|spotify/.test(lower)) return "Bills & Utilities";
  if (/travel|airbnb|hotel|airline|flight|tour|holiday/.test(lower)) return "Travel & Lifestyle";
  if (/entertainment|movie|cinema|theater|theatre|concert|show|ticket|tickets|game|gaming|arcade|karaoke|amusement|disney|steam|playstation|xbox/.test(lower))
    return "Entertainment";
  if (/shop|shopping|mall|amazon|lazada|shopee|retail/.test(lower)) return "Shopping";
  if (/health|doctor|clinic|pharmacy|medical|hospital/.test(lower)) return "Health & Wellness";
  if (/education|tuition|school|college|course|learning/.test(lower)) return "Education";
  if (/gift|donation|charity|present/.test(lower)) return "Gifts & Donations";
  if (/business|invoice|client|contract/.test(lower)) return "Business";
  if (/fee|interest|loan|financial|bank charge/.test(lower)) return "Financial";
  return "Other";
};

export const defaultCategoryForType = (type: TransactionType) => CATEGORY_FALLBACKS[type];

export const detectInstitutionFromText = (text: string | null | undefined) => {
  const normalized = normalizeWhitespace(String(text ?? ""));
  for (const institution of KNOWN_INSTITUTIONS) {
    if (institution.match.test(normalized)) {
      return institution.name;
    }
  }

  if (
    /PERIOD\s+COVERED/i.test(normalized) &&
    /ACCOUNT\s+NUMBER/i.test(normalized) &&
    /PHILIPPINE\s+PESO/i.test(normalized) &&
    /\b\d{1,2}\s+[A-Z]{3}\s+\d{2,4}\b/i.test(normalized)
  ) {
    return "Security Bank";
  }

  return null;
};

export const detectAccountNumber = (text: string | null | undefined) => {
  const normalized = normalizeWhitespace(String(text ?? ""));
  const labeledAccountSection =
    normalized.match(
      /\b(?:ACCOUNT\s*(?:NO|NUMBER|#)?|ACCT\s*(?:NO|NUMBER|#)?|A\/C\s*(?:NO|NUMBER|#)?|CARD\s*(?:NO|NUMBER|#)?|NO)\s*[:\-]?\s*((?:\d[\d\s-]{6,}\d))/i
    )?.[1] ??
    "";
  const trailingDigits =
    normalized
      .match(/\b(?:\d[\d\s-]{10,}\d)\b/g)
      ?.map((candidate) => candidate.replace(/\D/g, ""))
      .filter((candidate) => candidate.length >= 8 && candidate.length <= 16)
      .sort((left, right) => right.length - left.length)[0] ?? "";
  const accountNumber = (labeledAccountSection || trailingDigits).replace(/\D/g, "").slice(0, 16) || null;
  return accountNumber;
};

export const detectStatementMetadataFromText = (text: string): StatementMetadataSnapshot => {
  const metadata = detectStatementMetadata(text);
  const institution = sanitizeBankNameLabel(metadata?.institution ?? detectInstitutionFromText(text));
  const accountNumber = metadata?.accountNumber ?? detectAccountNumber(text);
  const normalizedText = normalizeWhitespace(text);
  const accountName =
    sanitizeBankNameLabel(metadata?.accountName) ??
    (institution && accountNumber ? `${institution} ${accountNumber.slice(-4)}` : institution ?? null);
  const refinedAccountType =
    metadata?.accountType ??
    (institution && /maya/i.test(institution)
      ? /\b(credit\s*card|card\s+ending|visa|mastercard|amex)\b/i.test(normalizedText)
        ? "credit_card"
        : /\b(maya\s+easy\s+credit|maya\s+credit|easy\s+credit|billing\s+statement|payment\s+due\s+date|total\s+amount\s+due|minimum\s+amount\s+due|credit\s+limit)\b/i.test(normalizedText)
          ? "line_of_credit"
          : /\b(wallet|cash\s*(?:in|out)|send\s+money|received\s+money|fund\s+transfer|transfer\s+to\s+maya\s+savings|auto\s*cash[- ]?in)\b/i.test(normalizedText)
            ? "wallet"
            : /\b(savings|consumer\s+savings|account\s+summary|running\s+balance|starting\s+balance|ending\s+balance|interest\s+earned)\b/i.test(normalizedText)
              ? "bank"
              : "bank"
      : null) ??
    (institution === "GoTyme" ? "bank" : null);
  const accountType = refinedAccountType ?? inferAccountTypeFromStatement(institution, accountName, "bank");
  const confidence =
    metadata?.confidence ??
    Math.min(
      100,
      [
        institution ? 35 : 0,
        accountNumber ? 35 : 0,
        accountName ? 10 : 0,
        accountType ? 5 : 0,
        metadata?.startDate ? 5 : 0,
        metadata?.endDate ? 5 : 0,
        metadata?.paymentDueDate ? 5 : 0,
        typeof metadata?.openingBalance === "number" ? 5 : 0,
        typeof metadata?.endingBalance === "number" ? 5 : 0,
        typeof metadata?.totalAmountDue === "number" ? 5 : 0,
      ].reduce((total, part) => total + part, 0)
    );

  return {
    institution,
    accountNumber,
    accountName,
    accountType,
    currency: metadata?.currency ?? null,
    openingBalance: metadata?.openingBalance ?? null,
    endingBalance: metadata?.endingBalance ?? null,
    paymentDueDate: metadata?.paymentDueDate ?? null,
    totalAmountDue: metadata?.totalAmountDue ?? null,
    startDate: metadata?.startDate ?? null,
    endDate: metadata?.endDate ?? null,
    confidence,
  };
};

export const mergeStatementMetadataWithTemplate = (
  detected: StatementMetadataSnapshot,
  template?: {
    institution?: string | null;
    accountNumber?: string | null;
    accountName?: string | null;
    accountType?: ImportedAccountType | null;
    currency?: string | null;
    openingBalance?: number | null;
    endingBalance?: number | null;
    paymentDueDate?: string | null;
    totalAmountDue?: number | null;
    startDate?: string | null;
    endDate?: string | null;
  } | null
) : StatementMetadataSnapshot => {
  if (!template) {
    return detected;
  }

  const detectedHasStrongIdentity = Boolean(detected.institution || detected.accountNumber || detected.accountName);
  const detectedHasAccountNumber = Boolean(detected.accountNumber);
  const preferTemplateIdentity = (detected.confidence ?? 0) < 80 && !detectedHasAccountNumber && !detectedHasStrongIdentity;
  const templateIdentityConfidence = Math.min(
    100,
    [
      template.institution ? 35 : 0,
      template.accountNumber ? 35 : 0,
      template.accountName ? 10 : 0,
      template.accountType ? 5 : 0,
      template.currency ? 5 : 0,
      template.startDate ? 5 : 0,
      template.endDate ? 5 : 0,
      template.paymentDueDate ? 5 : 0,
      template.openingBalance !== null ? 5 : 0,
      template.endingBalance !== null ? 5 : 0,
      typeof template.totalAmountDue === "number" ? 5 : 0,
    ].reduce((total, part) => total + part, 0)
  );

  return {
    institution:
      preferTemplateIdentity && template.institution
        ? template.institution
        : detected.institution ?? template.institution ?? null,
    accountNumber:
      preferTemplateIdentity && template.accountNumber
        ? template.accountNumber
        : detected.accountNumber ?? template.accountNumber ?? null,
    accountName:
      preferTemplateIdentity && template.accountName
        ? template.accountName
        : detected.accountName ?? template.accountName ?? null,
    accountType:
      preferTemplateIdentity && template.accountType
        ? template.accountType
        : detected.accountType ?? template.accountType ?? null,
    currency:
      preferTemplateIdentity && template.currency
        ? template.currency
        : detected.currency ?? template.currency ?? null,
    openingBalance: detected.openingBalance ?? template.openingBalance ?? null,
    endingBalance: detected.endingBalance ?? template.endingBalance ?? null,
    paymentDueDate: detected.paymentDueDate ?? template.paymentDueDate ?? null,
    totalAmountDue: detected.totalAmountDue ?? template.totalAmountDue ?? null,
    startDate: detected.startDate ?? template.startDate ?? null,
    endDate: detected.endDate ?? template.endDate ?? null,
    confidence: Math.max(detected.confidence ?? 0, templateIdentityConfidence),
  };
};

export const isMissingDatabaseRelationError = (error: unknown, tableName: string) => {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  const combined = `${code} ${message}`.toLowerCase();
  return combined.includes(tableName.toLowerCase()) && (combined.includes("does not exist") || code === "p2021");
};

export const isMissingDatabaseColumnError = (error: unknown) => {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  const combined = `${code} ${message}`.toLowerCase();
  return combined.includes("does not exist") && combined.includes("column") || code === "p2022";
};

export const extractMissingDatabaseColumn = (error: unknown) => {
  if (!error || typeof error !== "object") {
    return null;
  }

  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  const match =
    message.match(/column\s+`([^`]+)`/i) ??
    message.match(/column\s+"([^"]+)"/i) ??
    message.match(/column\s+([A-Za-z0-9_]+)\s+of\s+relation/i);
  const raw = match?.[1] ?? null;
  if (!raw) {
    return null;
  }

  return raw.split(" of relation")[0]?.trim() || null;
};

const columnCache = new Map<string, string[]>();
const tableExistsCache = new Map<string, boolean>();

type StatementMetadataSnapshot = {
  institution: string | null;
  accountNumber: string | null;
  accountName: string | null;
  accountType: ImportedAccountType | null;
  currency: string | null;
  openingBalance: number | null;
  endingBalance: number | null;
  paymentDueDate?: string | null;
  totalAmountDue?: number | null;
  startDate: string | null;
  endDate: string | null;
  confidence: number;
};

export const hasCompatibleTable = async (tableName: string) => {
  const cached = tableExistsCache.get(tableName);
  if (typeof cached === "boolean") {
    return cached;
  }

  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${tableName}
    ) AS "exists"
  `;

  const exists = Boolean(rows[0]?.exists);
  tableExistsCache.set(tableName, exists);
  return exists;
};

export const getCompatibleParsedTransactionColumns = async () => {
  const cacheKey = "ParsedTransaction";
  const cached = columnCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ParsedTransaction'
  `;

  const existing = new Set(columns.map((column) => column.column_name));
  const compatible = PARSED_TRANSACTION_COLUMNS.filter((column) => existing.has(column));
  columnCache.set(cacheKey, compatible as string[]);
  return compatible as string[];
};

export const getCompatibleImportFileColumns = async () => {
  const cacheKey = "ImportFile";
  const cached = columnCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ImportFile'
  `;

  const existing = new Set(columns.map((column) => column.column_name));
  const compatible = IMPORT_FILE_COLUMNS.filter((column) => existing.has(column));
  columnCache.set(cacheKey, compatible as string[]);
  return compatible as string[];
};

export const getCompatibleTrainingSignalColumns = async () => {
  const cacheKey = "TrainingSignal";
  const cached = columnCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'TrainingSignal'
  `;

  const existing = new Set(columns.map((column) => column.column_name));
  const compatible = TRAINING_SIGNAL_COLUMNS.filter((column) => existing.has(column));
  columnCache.set(cacheKey, compatible as string[]);
  return compatible as string[];
};

export const getCompatibleTransactionColumns = async () => {
  const cacheKey = "Transaction";
  const cached = columnCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Transaction'
  `;

  const existing = new Set(columns.map((column) => column.column_name));
  const compatible = TRANSACTION_COLUMNS.filter((column) => existing.has(column));
  columnCache.set(cacheKey, compatible as string[]);
  return compatible as string[];
};

export const getCompatibleStatementTemplateColumns = async () => {
  const cacheKey = "StatementTemplate";
  const cached = columnCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'StatementTemplate'
  `;

  const existing = new Set(columns.map((column) => column.column_name));
  const compatible = STATEMENT_TEMPLATE_COLUMNS.filter((column) => existing.has(column));
  columnCache.set(cacheKey, compatible as string[]);
  return compatible as string[];
};

export const getCompatibleDocumentImportColumns = async () => {
  const cacheKey = "DocumentImport";
  const cached = columnCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'DocumentImport'
  `;

  const existing = new Set(columns.map((column) => column.column_name));
  const compatible = DOCUMENT_IMPORT_COLUMNS.filter((column) => existing.has(column));
  columnCache.set(cacheKey, compatible as string[]);
  return compatible as string[];
};

export const getCompatibleDocumentImportPageColumns = async () => {
  const cacheKey = "DocumentImportPage";
  const cached = columnCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'DocumentImportPage'
  `;

  const existing = new Set(columns.map((column) => column.column_name));
  const compatible = DOCUMENT_IMPORT_PAGE_COLUMNS.filter((column) => existing.has(column));
  columnCache.set(cacheKey, compatible as string[]);
  return compatible as string[];
};

export const getCompatibleReceiptDocumentColumns = async () => {
  const cacheKey = "ReceiptDocument";
  const cached = columnCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ReceiptDocument'
  `;

  const existing = new Set(columns.map((column) => column.column_name));
  const compatible = RECEIPT_DOCUMENT_COLUMNS.filter((column) => existing.has(column));
  columnCache.set(cacheKey, compatible as string[]);
  return compatible as string[];
};

export const getCompatibleInvestmentSnapshotColumns = async () => {
  const cacheKey = "InvestmentSnapshot";
  const cached = columnCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'InvestmentSnapshot'
  `;

  const existing = new Set(columns.map((column) => column.column_name));
  const compatible = INVESTMENT_SNAPSHOT_COLUMNS.filter((column) => existing.has(column));
  columnCache.set(cacheKey, compatible as string[]);
  return compatible as string[];
};

export const getCompatibleInvestmentHoldingColumns = async () => {
  const cacheKey = "InvestmentHolding";
  const cached = columnCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'InvestmentHolding'
  `;

  const existing = new Set(columns.map((column) => column.column_name));
  const compatible = INVESTMENT_HOLDING_COLUMNS.filter((column) => existing.has(column));
  columnCache.set(cacheKey, compatible as string[]);
  return compatible as string[];
};

export const getCompatibleRecurringPatternColumns = async () => {
  const cacheKey = "RecurringPattern";
  const cached = columnCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'RecurringPattern'
  `;

  const existing = new Set(columns.map((column) => column.column_name));
  const compatible = RECURRING_PATTERN_COLUMNS.filter((column) => existing.has(column));
  columnCache.set(cacheKey, compatible as string[]);
  return compatible as string[];
};

export const loadStatementTemplate = async (params: {
  workspaceId: string;
  fingerprint: string;
}) => {
  const columns = await getCompatibleStatementTemplateColumns();
  if (columns.length === 0) {
    return null;
  }

  try {
    const template = await prisma.statementTemplate.findUnique({
      where: {
        workspaceId_fingerprint: {
          workspaceId: params.workspaceId,
          fingerprint: params.fingerprint,
        },
      },
    });

    if (!template) {
      return null;
    }

    return template as StatementTemplateRow;
  } catch (error) {
    if (isMissingDatabaseRelationError(error, "StatementTemplate")) {
      return null;
    }

    throw error;
  }
};

export const loadBestStatementTemplateForInstitution = async (params: {
  workspaceId: string;
  institution?: string | null;
  fileType?: string | null;
  accountType?: ImportedAccountType | null;
  statementFamilySignature?: string | null;
}) => {
  const columns = await getCompatibleStatementTemplateColumns();
  if (columns.length === 0) {
    return null;
  }

  const institution = sanitizeBankNameLabel(params.institution ?? null);
  if (!institution || institution === "Unknown") {
    return null;
  }

  try {
    const templates = await prisma.statementTemplate.findMany({
      where: {
        workspaceId: params.workspaceId,
        institution,
        ...(params.fileType ? { fileType: params.fileType } : {}),
      },
      orderBy: [{ successCount: "desc" }, { exampleCount: "desc" }, { updatedAt: "desc" }],
      take: 5,
    });

    const scoredTemplates = templates
      .map((template) => ({
        template,
        score: scoreStatementTemplateCandidate({
          template,
          institution,
          fileType: params.fileType ?? null,
          accountType: params.accountType ?? null,
          statementFamilySignature: params.statementFamilySignature ?? null,
        }),
      }))
      .sort((a, b) => b.score - a.score);

    return (scoredTemplates[0]?.template ?? null) as StatementTemplateRow | null;
  } catch (error) {
    if (isMissingDatabaseRelationError(error, "StatementTemplate")) {
      return null;
    }

    throw error;
  }
};

const toNullableDecimal = (value: unknown) => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? new Prisma.Decimal(String(value)) : null;
  }

  if (typeof value === "string") {
    const normalized = value.replace(/[%,$\s]/g, "").trim();
    if (!normalized) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? new Prisma.Decimal(String(parsed)) : null;
  }

  return null;
};

export const getCompatibleMerchantRuleColumns = async () => {
  const cacheKey = "MerchantRule";
  const cached = columnCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'MerchantRule'
  `;

  const existing = new Set(columns.map((column) => column.column_name));
  const compatible = MERCHANT_RULE_COLUMNS.filter((column) => existing.has(column));
  columnCache.set(cacheKey, compatible as string[]);
  return compatible as string[];
};

export const getCompatibleAccountRuleColumns = async () => {
  const cacheKey = "AccountRule";
  const cached = columnCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'AccountRule'
  `;

  const existing = new Set(columns.map((column) => column.column_name));
  const compatible = ACCOUNT_RULE_COLUMNS.filter((column) => existing.has(column));
  columnCache.set(cacheKey, compatible as string[]);
  return compatible as string[];
};

export const buildImportFileInsertData = async (params: {
  id?: string;
  workspaceId: string;
  accountId?: string | null;
  fileName: string;
  fileType: string;
  storageKey: string;
  status?: string;
}) => {
  const columns = new Set(await getCompatibleImportFileColumns());
  const record: Record<string, unknown> = {};

  if (columns.has("id")) record.id = params.id ?? crypto.randomUUID();
  if (columns.has("workspaceId")) record.workspaceId = params.workspaceId;
  if (columns.has("accountId")) record.accountId = params.accountId ?? null;
  if (columns.has("fileName")) record.fileName = params.fileName;
  if (columns.has("fileType")) record.fileType = params.fileType;
  if (columns.has("storageKey")) record.storageKey = params.storageKey;
  if (columns.has("status")) record.status = params.status ?? "processing";
  if (columns.has("parsedRowsCount")) record.parsedRowsCount = 0;
  if (columns.has("confirmedTransactionsCount")) record.confirmedTransactionsCount = 0;
  if (columns.has("confirmedAt")) record.confirmedAt = null;
  if (columns.has("uploadedAt")) record.uploadedAt = new Date();
  if (columns.has("deletedAt")) record.deletedAt = null;
  if (columns.has("createdAt")) record.createdAt = new Date();
  if (columns.has("updatedAt")) record.updatedAt = new Date();

  return record;
};

export const insertImportFileCompat = async (params: {
  id?: string;
  workspaceId: string;
  accountId?: string | null;
  fileName: string;
  fileType: string;
  storageKey: string;
  status?: string;
}): Promise<any> => {
  const record = await buildImportFileInsertData(params);
  const columns = Object.keys(record);
  if (columns.length === 0) {
    return null;
  }

  const values = columns.map((column) => record[column] ?? null);
  const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
  await prisma.$executeRawUnsafe(
    `INSERT INTO "ImportFile" (${columns.map((column) => `"${column}"`).join(", ")}) VALUES (${placeholders})`,
    ...values
  );

  if (typeof record.id === "string") {
    const inserted = await fetchImportFileCompat(record.id);
    return inserted ?? record;
  }

  return record;
};

export const fetchImportFileCompat = async (importFileId: string): Promise<any | null> => {
  const columns = await getCompatibleImportFileColumns();
  if (columns.length === 0) {
    return null;
  }

  const selectColumns = columns.map((column) => `"${column}"`).join(", ");
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT ${selectColumns} FROM "ImportFile" WHERE "id" = $1 LIMIT 1`,
    importFileId
  );

  return rows[0] ?? null;
};

export const listImportFilesCompat = async (workspaceId: string): Promise<any[]> => {
  const columns = await getCompatibleImportFileColumns();
  if (columns.length === 0) {
    return [];
  }

  const selectColumns = columns.map((column) => `"${column}"`).join(", ");
  const orderBy = columns.includes("uploadedAt")
    ? ' ORDER BY "uploadedAt" DESC'
    : columns.includes("createdAt")
      ? ' ORDER BY "createdAt" DESC'
      : ' ORDER BY "id" DESC';

  return prisma.$queryRawUnsafe<any[]>(
    `SELECT ${selectColumns} FROM "ImportFile" WHERE "workspaceId" = $1${orderBy}`,
    workspaceId
  );
};

export const listAllImportFilesCompat = async (limit?: number): Promise<any[]> => {
  const columns = await getCompatibleImportFileColumns();
  if (columns.length === 0) {
    return [];
  }

  const selectColumns = columns.map((column) => `"${column}"`).join(", ");
  const orderBy = columns.includes("uploadedAt")
    ? ' ORDER BY "uploadedAt" DESC'
    : columns.includes("createdAt")
      ? ' ORDER BY "createdAt" DESC'
      : ' ORDER BY "id" DESC';
  const limitClause = Number.isFinite(limit ?? NaN) ? ` LIMIT ${Math.max(1, Number(limit))}` : "";

  return prisma.$queryRawUnsafe<any[]>(`SELECT ${selectColumns} FROM "ImportFile"${orderBy}${limitClause}`);
};

export const updateImportFileCompat = async (
  importFileId: string,
  data: Partial<Record<string, unknown>>
): Promise<any | null> => {
  const columns = new Set(await getCompatibleImportFileColumns());
  const entries = Object.entries(data).filter(([key, value]) => columns.has(key) && value !== undefined);
  if (columns.has("updatedAt")) {
    entries.push(["updatedAt", new Date()]);
  }

  if (entries.length > 0) {
    const setClause = entries.map(([key], index) => `"${key}" = $${index + 1}`).join(", ");
    const values = entries.map(([, value]) => value);
    await prisma.$executeRawUnsafe(
      `UPDATE "ImportFile" SET ${setClause} WHERE "id" = $${entries.length + 1}`,
      ...values,
      importFileId
    );
  }

  return fetchImportFileCompat(importFileId);
};

export const upsertDocumentImportCompat = async (params: {
  workspaceId: string;
  importFileId?: string | null;
  accountId?: string | null;
  documentFamily: string;
  documentSubtype?: string | null;
  institution?: string | null;
  accountName?: string | null;
  accountNumber?: string | null;
  currency?: string | null;
  pageCount?: number;
  confidence?: number;
  sourceMetadata?: Prisma.InputJsonValue | null;
  rawPayload?: Prisma.InputJsonValue | null;
  extractedPayload?: Prisma.InputJsonValue | null;
}) => {
  if (!(await hasCompatibleTable("DocumentImport")) || !params.importFileId) {
    return null;
  }

  try {
    return await prisma.documentImport.upsert({
      where: {
        importFileId: params.importFileId,
      },
      update: {
        workspaceId: params.workspaceId,
        accountId: params.accountId ?? null,
        documentFamily: params.documentFamily,
        documentSubtype: params.documentSubtype ?? null,
        institution: params.institution ?? null,
        accountName: params.accountName ?? null,
        accountNumber: params.accountNumber ?? null,
        currency: params.currency ?? "PHP",
        pageCount: params.pageCount ?? 0,
        confidence: params.confidence ?? 0,
        sourceMetadata: params.sourceMetadata ?? undefined,
        rawPayload: params.rawPayload ?? undefined,
        extractedPayload: params.extractedPayload ?? undefined,
      },
      create: {
        workspaceId: params.workspaceId,
        importFileId: params.importFileId,
        accountId: params.accountId ?? null,
        documentFamily: params.documentFamily,
        documentSubtype: params.documentSubtype ?? null,
        institution: params.institution ?? null,
        accountName: params.accountName ?? null,
        accountNumber: params.accountNumber ?? null,
        currency: params.currency ?? "PHP",
        pageCount: params.pageCount ?? 0,
        confidence: params.confidence ?? 0,
        sourceMetadata: params.sourceMetadata ?? undefined,
        rawPayload: params.rawPayload ?? undefined,
        extractedPayload: params.extractedPayload ?? undefined,
      },
    });
  } catch (error) {
    if (isMissingDatabaseRelationError(error, "DocumentImport") || isMissingDatabaseColumnError(error)) {
      return null;
    }

    throw error;
  }
};

export const replaceDocumentImportPagesCompat = async (params: {
  documentImportId?: string | null;
  pages: Array<{
    pageNumber: number;
    imageName?: string | null;
    pageType?: string | null;
    visibleTitle?: string | null;
    visibleDate?: string | null;
    visibleCurrency?: string | null;
    rawOcrText?: string | null;
    layoutNotes?: string | null;
    confidence?: number;
    rawPayload?: Prisma.InputJsonValue | null;
  }>;
}) => {
  if (!(await hasCompatibleTable("DocumentImportPage")) || !params.documentImportId) {
    return null;
  }

  try {
    await prisma.documentImportPage.deleteMany({
      where: { documentImportId: params.documentImportId },
    });

    if (params.pages.length > 0) {
      await prisma.documentImportPage.createMany({
        data: params.pages.map((page) => ({
          documentImportId: params.documentImportId as string,
          pageNumber: page.pageNumber,
          imageName: page.imageName ?? null,
          pageType: page.pageType ?? null,
          visibleTitle: page.visibleTitle ?? null,
          visibleDate: page.visibleDate ?? null,
          visibleCurrency: page.visibleCurrency ?? null,
          rawOcrText: page.rawOcrText ?? null,
          layoutNotes: page.layoutNotes ?? null,
          confidence: page.confidence ?? 0,
          rawPayload: page.rawPayload ?? undefined,
        })),
      });
    }
  } catch (error) {
    if (isMissingDatabaseRelationError(error, "DocumentImportPage") || isMissingDatabaseColumnError(error)) {
      return null;
    }

    throw error;
  }
};

export const upsertReceiptDocumentCompat = async (params: {
  workspaceId: string;
  documentImportId?: string | null;
  accountId?: string | null;
  transactionId?: string | null;
  merchantRaw?: string | null;
  merchantClean?: string | null;
  transactionDate?: Date | null;
  transactionTime?: string | null;
  currency?: string | null;
  subtotal?: string | number | null;
  tax?: string | number | null;
  total?: string | number | null;
  paymentMethod?: string | null;
  accountMatch?: Prisma.InputJsonValue | null;
  confidence?: number;
  rawPayload?: Prisma.InputJsonValue | null;
}) => {
  if (!(await hasCompatibleTable("ReceiptDocument")) || !params.documentImportId) {
    return null;
  }

  try {
    return await prisma.receiptDocument.upsert({
      where: { documentImportId: params.documentImportId },
      update: {
        workspaceId: params.workspaceId,
        accountId: params.accountId ?? null,
        transactionId: params.transactionId ?? null,
        merchantRaw: params.merchantRaw ?? null,
        merchantClean: params.merchantClean ?? null,
        transactionDate: params.transactionDate ?? null,
        transactionTime: params.transactionTime ?? null,
        currency: params.currency ?? "PHP",
        subtotal: toNullableDecimal(params.subtotal),
        tax: toNullableDecimal(params.tax),
        total: toNullableDecimal(params.total),
        paymentMethod: params.paymentMethod ?? null,
        accountMatch: params.accountMatch ?? undefined,
        confidence: params.confidence ?? 0,
        rawPayload: params.rawPayload ?? undefined,
      },
      create: {
        workspaceId: params.workspaceId,
        documentImportId: params.documentImportId,
        accountId: params.accountId ?? null,
        transactionId: params.transactionId ?? null,
        merchantRaw: params.merchantRaw ?? null,
        merchantClean: params.merchantClean ?? null,
        transactionDate: params.transactionDate ?? null,
        transactionTime: params.transactionTime ?? null,
        currency: params.currency ?? "PHP",
        subtotal: toNullableDecimal(params.subtotal),
        tax: toNullableDecimal(params.tax),
        total: toNullableDecimal(params.total),
        paymentMethod: params.paymentMethod ?? null,
        accountMatch: params.accountMatch ?? undefined,
        confidence: params.confidence ?? 0,
        rawPayload: params.rawPayload ?? undefined,
      },
    });
  } catch (error) {
    if (isMissingDatabaseRelationError(error, "ReceiptDocument") || isMissingDatabaseColumnError(error)) {
      return null;
    }

    throw error;
  }
};

export const upsertInvestmentSnapshotCompat = async (params: {
  workspaceId: string;
  documentImportId?: string | null;
  accountId?: string | null;
  snapshotDate?: Date | null;
  portfolioName?: string | null;
  currency?: string | null;
  totalValue?: string | number | null;
  costBasis?: string | number | null;
  gainLossValue?: string | number | null;
  gainLossPercent?: string | number | null;
  confidence?: number;
  rawPayload?: Prisma.InputJsonValue | null;
}) => {
  if (!(await hasCompatibleTable("InvestmentSnapshot")) || !params.documentImportId) {
    return null;
  }

  try {
    return await prisma.investmentSnapshot.upsert({
      where: { documentImportId: params.documentImportId },
      update: {
        workspaceId: params.workspaceId,
        accountId: params.accountId ?? null,
        snapshotDate: params.snapshotDate ?? null,
        portfolioName: params.portfolioName ?? null,
        currency: params.currency ?? "PHP",
        totalValue: toNullableDecimal(params.totalValue),
        costBasis: toNullableDecimal(params.costBasis),
        gainLossValue: toNullableDecimal(params.gainLossValue),
        gainLossPercent: toNullableDecimal(params.gainLossPercent),
        confidence: params.confidence ?? 0,
        rawPayload: params.rawPayload ?? undefined,
      },
      create: {
        workspaceId: params.workspaceId,
        documentImportId: params.documentImportId,
        accountId: params.accountId ?? null,
        snapshotDate: params.snapshotDate ?? null,
        portfolioName: params.portfolioName ?? null,
        currency: params.currency ?? "PHP",
        totalValue: toNullableDecimal(params.totalValue),
        costBasis: toNullableDecimal(params.costBasis),
        gainLossValue: toNullableDecimal(params.gainLossValue),
        gainLossPercent: toNullableDecimal(params.gainLossPercent),
        confidence: params.confidence ?? 0,
        rawPayload: params.rawPayload ?? undefined,
      },
    });
  } catch (error) {
    if (isMissingDatabaseRelationError(error, "InvestmentSnapshot") || isMissingDatabaseColumnError(error)) {
      return null;
    }

    throw error;
  }
};

export const replaceInvestmentHoldingsCompat = async (params: {
  workspaceId: string;
  investmentSnapshotId?: string | null;
  documentImportId?: string | null;
  accountId?: string | null;
  holdings: Array<{
    rowIndex?: number | null;
    assetName: string;
    assetSymbol?: string | null;
    assetType?: string | null;
    quantity?: string | number | null;
    unitPrice?: string | number | null;
    costBasis?: string | number | null;
    marketValue?: string | number | null;
    currentValue?: string | number | null;
    gainLossValue?: string | number | null;
    gainLossPercent?: string | number | null;
    currency?: string | null;
    status?: string | null;
    confidence?: number;
    rawPayload?: Prisma.InputJsonValue | null;
  }>;
}) => {
  if (!(await hasCompatibleTable("InvestmentHolding")) || !params.investmentSnapshotId) {
    return null;
  }

  try {
    await prisma.investmentHolding.deleteMany({
      where: { investmentSnapshotId: params.investmentSnapshotId },
    });

    if (params.holdings.length > 0) {
      await prisma.investmentHolding.createMany({
        data: params.holdings.map((holding, index) => ({
          workspaceId: params.workspaceId,
          investmentSnapshotId: params.investmentSnapshotId as string,
          documentImportId: params.documentImportId ?? null,
          accountId: params.accountId ?? null,
          rowIndex: holding.rowIndex ?? index + 1,
          assetName: holding.assetName,
          assetSymbol: holding.assetSymbol ?? null,
          assetType: holding.assetType ?? null,
          quantity: toNullableDecimal(holding.quantity),
          unitPrice: toNullableDecimal(holding.unitPrice),
          costBasis: toNullableDecimal(holding.costBasis),
          marketValue: toNullableDecimal(holding.marketValue),
          currentValue: toNullableDecimal(holding.currentValue),
          gainLossValue: toNullableDecimal(holding.gainLossValue),
          gainLossPercent: toNullableDecimal(holding.gainLossPercent),
          currency: holding.currency ?? "PHP",
          status: holding.status ?? null,
          confidence: holding.confidence ?? 0,
          rawPayload: holding.rawPayload ?? undefined,
        })),
      });
    }
  } catch (error) {
    if (isMissingDatabaseRelationError(error, "InvestmentHolding") || isMissingDatabaseColumnError(error)) {
      return null;
    }

    throw error;
  }
};

export const replaceRecurringPatternsCompat = async (params: {
  workspaceId: string;
  documentImportId?: string | null;
  accountId?: string | null;
  patterns: Array<{
    merchantRaw: string;
    merchantClean?: string | null;
    amount?: string | number | null;
    currency?: string | null;
    frequency?: string | null;
    firstSeenDate?: Date | null;
    lastSeenDate?: Date | null;
    nextExpectedDate?: Date | null;
    transactionCount?: number;
    confidence?: number;
    rawPayload?: Prisma.InputJsonValue | null;
  }>;
}) => {
  if (!(await hasCompatibleTable("RecurringPattern")) || !params.documentImportId) {
    return null;
  }

  try {
    await prisma.recurringPattern.deleteMany({
      where: { documentImportId: params.documentImportId },
    });

    if (params.patterns.length > 0) {
      await prisma.recurringPattern.createMany({
        data: params.patterns.map((pattern) => ({
          workspaceId: params.workspaceId,
          documentImportId: params.documentImportId as string,
          accountId: params.accountId ?? null,
          merchantRaw: pattern.merchantRaw,
          merchantClean: pattern.merchantClean ?? null,
          amount: toNullableDecimal(pattern.amount),
          currency: pattern.currency ?? "PHP",
          frequency: (pattern.frequency ?? null) as any,
          firstSeenDate: pattern.firstSeenDate ?? null,
          lastSeenDate: pattern.lastSeenDate ?? null,
          nextExpectedDate: pattern.nextExpectedDate ?? null,
          transactionCount: pattern.transactionCount ?? 1,
          confidence: pattern.confidence ?? 0,
          rawPayload: pattern.rawPayload ?? undefined,
        })),
      });
    }
  } catch (error) {
    if (isMissingDatabaseRelationError(error, "RecurringPattern") || isMissingDatabaseColumnError(error)) {
      return null;
    }

    throw error;
  }
};

export const deleteTransactionsByImportFileCompat = async (importFileId: string) => {
  const columns = new Set(await getCompatibleTransactionColumns());
  if (!columns.has("importFileId")) {
    return;
  }

  await prisma.$executeRawUnsafe(`DELETE FROM "Transaction" WHERE "importFileId" = $1`, importFileId);
};

export const countTransactionsByImportFileCompat = async (importFileId: string) => {
  const columns = new Set(await getCompatibleTransactionColumns());
  if (!columns.has("importFileId")) {
    return 0;
  }

  const result = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*)::bigint AS count FROM "Transaction" WHERE "importFileId" = $1`,
    importFileId
  );
  return Number(result[0]?.count ?? 0n);
};

type TransactionInsertParams = {
  workspaceId: string;
  accountId: string;
  importFileId?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  reviewStatus?: string;
  parserConfidence?: number;
  categoryConfidence?: number;
  accountMatchConfidence?: number;
  duplicateConfidence?: number;
  transferConfidence?: number;
  rawPayload?: Prisma.InputJsonValue | null;
  normalizedPayload?: Prisma.InputJsonValue | null;
  learnedRuleIdsApplied?: Prisma.InputJsonValue | null;
  date: Date;
  amount: string | number;
  currency: string;
  type: TransactionType;
  merchantRaw: string;
  merchantClean?: string | null;
  description?: string | null;
  isTransfer?: boolean;
  isExcluded?: boolean;
};

const buildTransactionInsertRecord = async (params: TransactionInsertParams, columns?: Set<string>) => {
  const columnSet = columns ?? new Set(await getCompatibleTransactionColumns());
  const record: Record<string, unknown> = {};
  const amount = parseAmountValue(typeof params.amount === "number" ? String(params.amount) : params.amount ?? null);

  if (amount === null) {
    throw new Error("Invalid transaction amount.");
  }

  if (columnSet.has("id")) record.id = crypto.randomUUID();
  if (columnSet.has("workspaceId")) record.workspaceId = params.workspaceId;
  if (columnSet.has("accountId")) record.accountId = params.accountId;
  if (columnSet.has("importFileId") && params.importFileId !== undefined) record.importFileId = params.importFileId ?? null;
  if (columnSet.has("categoryId")) record.categoryId = params.categoryId ?? null;
  if (columnSet.has("categoryName")) record.categoryName = params.categoryName ?? null;
  if (columnSet.has("reviewStatus")) record.reviewStatus = params.reviewStatus ?? "suggested";
  if (columnSet.has("parserConfidence")) record.parserConfidence = params.parserConfidence ?? 0;
  if (columnSet.has("categoryConfidence")) record.categoryConfidence = params.categoryConfidence ?? 0;
  if (columnSet.has("accountMatchConfidence")) record.accountMatchConfidence = params.accountMatchConfidence ?? 0;
  if (columnSet.has("duplicateConfidence")) record.duplicateConfidence = params.duplicateConfidence ?? 0;
  if (columnSet.has("transferConfidence")) record.transferConfidence = params.transferConfidence ?? 0;
  if (columnSet.has("rawPayload")) record.rawPayload = params.rawPayload ?? null;
  if (columnSet.has("normalizedPayload")) record.normalizedPayload = params.normalizedPayload ?? null;
  if (columnSet.has("learnedRuleIdsApplied")) record.learnedRuleIdsApplied = params.learnedRuleIdsApplied ?? null;
  if (columnSet.has("date")) record.date = params.date;
  if (columnSet.has("amount")) record.amount = amount;
  if (columnSet.has("currency")) record.currency = params.currency;
  if (columnSet.has("type")) record.type = params.type;
  if (columnSet.has("merchantRaw")) record.merchantRaw = params.merchantRaw;
  if (columnSet.has("merchantClean")) record.merchantClean = params.merchantClean ?? null;
  if (columnSet.has("description")) record.description = params.description ?? null;
  if (columnSet.has("isTransfer")) record.isTransfer = params.isTransfer ?? false;
  if (columnSet.has("isExcluded")) record.isExcluded = params.isExcluded ?? false;
  if (columnSet.has("deletedAt")) record.deletedAt = null;
  if (columnSet.has("createdAt")) record.createdAt = new Date();
  if (columnSet.has("updatedAt")) record.updatedAt = new Date();

  return {
    record,
    amount,
  };
};

export const insertTransactionCompat = async (params: TransactionInsertParams) => {
  const columns = new Set(await getCompatibleTransactionColumns());
  const { record } = await buildTransactionInsertRecord(params, columns);
  const keys = Object.keys(record);
  if (keys.length === 0) {
    return null;
  }

  const values = keys.map((key) => record[key] ?? null);
  const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
  await prisma.$executeRawUnsafe(
    `INSERT INTO "Transaction" (${keys.map((key) => `"${key}"`).join(", ")}) VALUES (${placeholders})`,
    ...values
  );

  return record;
};

export const insertTransactionManyCompat = async (params: {
  records: Record<string, unknown>[];
}) => {
  if (params.records.length === 0) {
    return [];
  }

  await prisma.transaction.createMany({
    data: params.records as Prisma.TransactionCreateManyInput[],
  });

  return params.records;
};

export const buildParsedTransactionInsertData = async (params: {
  importFileId: string;
  workspaceId: string;
  rows: EnrichedParsedImportRow[];
  metadata: ReturnType<typeof detectStatementMetadataFromText>;
  statementFingerprint: string;
}) => {
  const columns = new Set(await getCompatibleParsedTransactionColumns());

  return params.rows.flatMap((row) => {
    const amount = parseAmountValue(row.amount ?? null);
    if (amount === null) {
      return [];
    }
    const currency =
      normalizeInstitutionCurrency(
        params.metadata.institution,
        row.currency ?? params.metadata.currency ?? "PHP",
        row.accountName ?? params.metadata.accountName ?? null
      ) ?? "PHP";

    const record: Record<string, unknown> = {};
    if (columns.has("id")) record.id = crypto.randomUUID();
    if (columns.has("importFileId")) record.importFileId = params.importFileId;
    if (columns.has("workspaceId")) record.workspaceId = params.workspaceId;
    if (columns.has("institution")) record.institution = params.metadata.institution;
    if (columns.has("accountNumber")) record.accountNumber = params.metadata.accountNumber;
    if (columns.has("accountName")) record.accountName = row.accountName ?? null;
    if (columns.has("date")) record.date = parseDateValue(row.date ?? null);
    if (columns.has("amount")) record.amount = amount;
    if (columns.has("currency")) record.currency = currency;
    if (columns.has("merchantRaw")) record.merchantRaw = row.merchantRaw ?? null;
    if (columns.has("merchantClean")) record.merchantClean = row.merchantClean ?? row.merchantRaw ?? null;
    if (columns.has("type")) record.type = row.type ?? "expense";
    if (columns.has("categoryName")) record.categoryName = row.categoryName ?? defaultCategoryForType(row.type ?? "expense");
    if (columns.has("confidence")) record.confidence = row.confidence ?? 0;
    if (columns.has("categoryReason")) record.categoryReason = row.categoryReason ?? null;
    if (columns.has("parserVersion")) record.parserVersion = row.parserVersion ?? DATA_ENGINE_VERSION;
    if (columns.has("statementFingerprint")) record.statementFingerprint = params.statementFingerprint;
    if (columns.has("rawPayload")) record.rawPayload = (row.rawPayload ?? {}) as Prisma.InputJsonValue;
    if (columns.has("reviewStatus")) record.reviewStatus = row.reviewStatus ?? "suggested";
    if (columns.has("parserConfidence")) record.parserConfidence = row.parserConfidence ?? row.confidence ?? 0;
    if (columns.has("categoryConfidence")) record.categoryConfidence = row.categoryConfidence ?? row.confidence ?? 0;
    if (columns.has("accountMatchConfidence")) record.accountMatchConfidence = row.accountMatchConfidence ?? 0;
    if (columns.has("duplicateConfidence")) record.duplicateConfidence = row.duplicateConfidence ?? 0;
    if (columns.has("transferConfidence")) record.transferConfidence = row.transferConfidence ?? 0;
    if (columns.has("normalizedPayload")) record.normalizedPayload = (row.normalizedPayload ?? null) as Prisma.InputJsonValue | null;
    if (columns.has("learnedRuleIdsApplied")) record.learnedRuleIdsApplied = (row.learnedRuleIdsApplied ?? null) as Prisma.InputJsonValue | null;
    if (columns.has("createdAt")) record.createdAt = new Date();
    return [record];
  });
};

export const insertParsedTransactionsCompat = async (params: {
  importFileId: string;
  rows: Array<Record<string, unknown>>;
}) => {
  if (params.rows.length === 0) {
    return;
  }

  const columns = await getCompatibleParsedTransactionColumns();
  if (columns.length === 0) {
    return;
  }

  const values: unknown[] = [];
  const tuples = params.rows.map((row) => {
    const placeholders = columns.map((column) => {
      values.push(row[column] ?? null);
      return `$${values.length}`;
    });
    return `(${placeholders.join(", ")})`;
  });

  await prisma.$executeRawUnsafe(
    `INSERT INTO "ParsedTransaction" (${columns.map((column) => `"${column}"`).join(", ")}) VALUES ${tuples.join(", ")}`,
    ...values
  );
};

export const fetchParsedTransactionRows = async (importFileId: string) => {
  const columns = await getCompatibleParsedTransactionColumns();
  if (columns.length === 0) {
    return [];
  }

  const selectColumns = columns.map((column) => `"${column}"`).join(", ");
  const orderBy = columns.includes("createdAt") ? ' ORDER BY "createdAt" ASC' : "";
  return prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT ${selectColumns} FROM "ParsedTransaction" WHERE "importFileId" = $1${orderBy}`,
    importFileId
  );
};

export const countParsedTransactionRows = async (importFileId: string) => {
  const result = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*)::bigint AS count FROM "ParsedTransaction" WHERE "importFileId" = $1`,
    importFileId
  );
  return Number(result[0]?.count ?? 0n);
};

export const loadMerchantRules = async (workspaceId: string) => {
  let rules: Array<{
    merchantKey: string;
    merchantPattern: string | null;
    normalizedName: string;
    categoryId: string | null;
    categoryName: string | null;
    source: string;
    confidence: number;
    timesConfirmed: number;
    category: { name: string } | null;
  }> = [];

  try {
    rules = await prisma.merchantRule.findMany({
      where: { workspaceId },
      include: {
        category: true,
      },
      orderBy: [{ timesConfirmed: "desc" }, { updatedAt: "desc" }],
      take: 500,
    });
  } catch (error) {
    if (!isMissingDatabaseRelationError(error, "MerchantRule")) {
      throw error;
    }
  }

  return rules.map((rule) => ({
    merchantKey: rule.merchantKey,
    merchantPattern: rule.merchantPattern,
    normalizedName: rule.normalizedName,
    categoryId: rule.categoryId,
    categoryName: rule.category?.name ?? rule.categoryName ?? null,
    source: rule.source,
    confidence: rule.confidence,
    timesConfirmed: rule.timesConfirmed,
  }));
};

export const loadAccountRules = async (workspaceId: string) => {
  let rules: Array<{
    ruleKey: string;
    accountId: string | null;
    accountName: string;
    institution: string | null;
    accountType: AccountType;
    source: string;
    confidence: number;
    timesConfirmed: number;
  }> = [];

  try {
    rules = await prisma.accountRule.findMany({
      where: { workspaceId },
      orderBy: [{ timesConfirmed: "desc" }, { updatedAt: "desc" }],
      take: 250,
    });
  } catch (error) {
    if (!isMissingDatabaseRelationError(error, "AccountRule")) {
      throw error;
    }
  }

  return rules.map((rule) => ({
    ruleKey: rule.ruleKey,
    accountId: rule.accountId,
    accountName: rule.accountName,
    institution: rule.institution,
    accountType: rule.accountType,
    source: rule.source,
    confidence: rule.confidence,
    timesConfirmed: rule.timesConfirmed,
  }));
};

export const upsertMerchantRule = async (params: {
  workspaceId: string;
  merchantText: string;
  normalizedName: string;
  categoryId: string;
  categoryName?: string | null;
  source: string;
  confidence?: number;
}) => {
  const merchantKey = normalizeMerchantText(params.merchantText);

  try {
    const rule = await prisma.merchantRule.upsert({
      where: {
        workspaceId_merchantKey: {
          workspaceId: params.workspaceId,
          merchantKey,
        },
      },
      update: {
        merchantPattern: params.merchantText.trim(),
        normalizedName: params.normalizedName.trim(),
        categoryId: params.categoryId,
        categoryName: params.categoryName ?? null,
        source: params.source,
        confidence: params.confidence ?? 100,
        timesConfirmed: { increment: 1 },
        lastUsedAt: new Date(),
      },
      create: {
        workspaceId: params.workspaceId,
        merchantKey,
        merchantPattern: params.merchantText.trim(),
        normalizedName: params.normalizedName.trim(),
        categoryId: params.categoryId,
        categoryName: params.categoryName ?? null,
        source: params.source,
        confidence: params.confidence ?? 100,
        timesConfirmed: 1,
        lastUsedAt: new Date(),
      },
    });

    return rule;
  } catch (error) {
    if (isMissingDatabaseRelationError(error, "MerchantRule")) {
      return null;
    }

    throw error;
  }
};

export const upsertAccountRule = async (params: {
  workspaceId: string;
  accountId?: string | null;
  accountName: string;
  institution?: string | null;
  accountType: AccountType;
  source: string;
  confidence?: number;
}) => {
  const ruleKey = normalizeAccountRuleKey(params.accountName, params.institution);

  try {
    return await prisma.accountRule.upsert({
      where: {
        workspaceId_ruleKey: {
          workspaceId: params.workspaceId,
          ruleKey,
        },
      },
      update: {
        accountId: params.accountId ?? null,
        accountName: params.accountName.trim(),
        institution: params.institution?.trim() || null,
        accountType: params.accountType,
        source: params.source,
        confidence: params.confidence ?? 100,
        timesConfirmed: { increment: 1 },
        lastUsedAt: new Date(),
      },
      create: {
        workspaceId: params.workspaceId,
        accountId: params.accountId ?? null,
        ruleKey,
        accountName: params.accountName.trim(),
        institution: params.institution?.trim() || null,
        accountType: params.accountType,
        source: params.source,
        confidence: params.confidence ?? 100,
        timesConfirmed: 1,
        lastUsedAt: new Date(),
      },
    });
  } catch (error) {
    if (isMissingDatabaseRelationError(error, "AccountRule")) {
      return null;
    }

    throw error;
  }
};

const scoreAccountRule = (
  accountName: string | null | undefined,
  institution: string | null | undefined,
  rule: AccountRuleRow
) => {
  const normalizedRuleKey = normalizeAccountRuleKey(rule.accountName, rule.institution);
  const normalizedInputKey = normalizeAccountRuleKey(accountName, institution);
  if (normalizedRuleKey === normalizedInputKey) {
    return 120 + rule.confidence + rule.timesConfirmed * 2;
  }

  const inputName = normalizeMerchantText(accountName ?? "");
  const ruleName = normalizeMerchantText(rule.accountName);
  const inputTokens = new Set(tokenizeMerchant(accountName ?? ""));
  const ruleTokens = tokenizeMerchant(rule.accountName);
  const ruleTokenSet = new Set(ruleTokens);
  let overlap = 0;

  for (const token of inputTokens) {
    if (ruleTokenSet.has(token)) {
      overlap += 1;
    }
  }

  if (overlap === 0 && inputName !== ruleName) {
    return 0;
  }

  return overlap * 22 + rule.confidence * 0.75 + rule.timesConfirmed;
};

const findBestAccountRule = (
  accountName: string | null | undefined,
  institution: string | null | undefined,
  accountRules: AccountRuleRow[]
) => {
  let bestRule: AccountRuleRow | null = null;
  let bestScore = 0;

  for (const rule of accountRules) {
    const score = scoreAccountRule(accountName, institution, rule);
    if (score > bestScore) {
      bestScore = score;
      bestRule = rule;
    }
  }

  return bestRule && bestScore >= 20
    ? {
        rule: bestRule,
        score: bestScore,
        exact: normalizeAccountRuleKey(bestRule.accountName, bestRule.institution) === normalizeAccountRuleKey(accountName, institution),
      }
    : null;
};

export const buildStatementFingerprint = (
  text: string,
  metadata: ReturnType<typeof detectStatementMetadataFromText>,
  fileName?: string | null,
  fileType?: string | null,
  documentFamily?: string | null
) => {
  const normalizedLines = text
    .split(/\r?\n/)
    .map((line) =>
      normalizeWhitespace(line)
        .replace(/\b\d{1,2}[/-][A-Za-z0-9]{1,4}[/-]\d{2,4}\b/g, "<date>")
        .replace(/\b[A-Z]{3}\s+\d{1,2},\s+\d{4}\b/g, "<date>")
        .replace(/[0-9][0-9,]*\.\d{2}/g, "<amount>")
        .replace(/\b\d{4,}\b/g, "<number>")
    )
    .filter(Boolean)
    .slice(0, 32);

  const fingerprintSource = [
    metadata.institution ?? "",
    metadata.accountNumber ?? "",
    metadata.accountType ?? "",
    metadata.startDate ?? "",
    metadata.endDate ?? "",
    (fileName ?? "").toLowerCase(),
    (fileType ?? "").toLowerCase(),
    (documentFamily ?? "").toLowerCase(),
    normalizedLines.join("\n"),
  ].join("|");

  return `stmt_${fnv1a(fingerprintSource)}`;
};

export const buildStatementFamilySignature = (params: {
  rows: ParsedImportRow[];
  metadata?: {
    institution?: string | null;
    accountType?: ImportedAccountType | null;
    startDate?: string | null;
    endDate?: string | null;
  } | null;
  fileType?: string | null;
}) => {
  const rows = Array.isArray(params.rows) ? params.rows : [];
  if (rows.length === 0) {
    return null;
  }

  const firstRow = rows[0] ?? null;
  const lastRow = rows.at(-1) ?? null;
  const firstMerchant = normalizeMerchantText(firstRow?.merchantClean || firstRow?.merchantRaw || firstRow?.description || firstRow?.name || "");
  const lastMerchant = normalizeMerchantText(lastRow?.merchantClean || lastRow?.merchantRaw || lastRow?.description || lastRow?.name || "");
  const firstDate = parseDateValue(firstRow?.date ?? firstRow?.transactionDate ?? firstRow?.postedDate ?? null);
  const lastDate = parseDateValue(lastRow?.date ?? lastRow?.transactionDate ?? lastRow?.postedDate ?? null);
  const rowCountBand = rows.length < 5 ? "tiny" : rows.length < 15 ? "small" : rows.length < 50 ? "medium" : "large";
  const hasBalance = rows.some(
    (row) => typeof row.balance === "string" || typeof row.balance === "number" || typeof row.runningBalance === "string" || typeof row.runningBalance === "number"
  );
  const typeCounts = rows.reduce(
    (counts, row) => {
      const type = String(row.type ?? "").toLowerCase();
      if (type === "income" || type === "expense" || type === "transfer") {
        counts[type] += 1;
      }
      return counts;
    },
    { income: 0, expense: 0, transfer: 0 }
  );
  const dominantType = (Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "mixed") as "income" | "expense" | "transfer" | "mixed";
  const institution = sanitizeBankNameLabel(params.metadata?.institution ?? null);
  const signatureParts = [
    institution && institution !== "Unknown" ? institution : null,
    params.metadata?.accountType ?? null,
    params.fileType ? params.fileType.toLowerCase() : null,
    rowCountBand,
    dominantType,
    hasBalance ? "balance" : "nobalance",
    firstDate ? firstDate.toISOString().slice(0, 10) : null,
    lastDate ? lastDate.toISOString().slice(0, 10) : null,
    firstMerchant || null,
    lastMerchant || null,
  ].filter((part): part is string => typeof part === "string" && part.trim().length > 0);

  return signatureParts.length > 0 ? signatureParts.join("|") : null;
};

export const buildStatementFamilySignatureFromText = (
  text: string,
  metadata?: {
    institution?: string | null;
    accountType?: ImportedAccountType | null;
  } | null,
  fileType?: string | null
) => {
  const normalizedLines = text
    .split(/\r?\n/)
    .map((line) =>
      normalizeWhitespace(line)
        .replace(/[|¦]/g, " ")
        .replace(/\b\d{1,2}[/-][A-Za-z0-9]{1,4}[/-]\d{2,4}\b/g, "<date>")
        .replace(/\b[A-Z]{3}\s+\d{1,2},\s+\d{4}\b/g, "<date>")
        .replace(/[0-9][0-9,]*\.\d{2}/g, "<amount>")
        .replace(/\b\d{4,}\b/g, "<number>")
    )
    .filter(Boolean);

  if (normalizedLines.length === 0) {
    return null;
  }

  const firstLine = normalizedLines[0] ?? "";
  const lastLine = normalizedLines.at(-1) ?? "";
  const rowCountBand = normalizedLines.length < 5 ? "tiny" : normalizedLines.length < 15 ? "small" : normalizedLines.length < 50 ? "medium" : "large";
  const balanceLike = normalizedLines.some((line) => /\b(?:balance|opening|closing|ending|running|available)\b/i.test(line));
  const amountLike = normalizedLines.some((line) => /<amount>/.test(line));
  const institution = sanitizeBankNameLabel(metadata?.institution ?? null);

  const signatureParts = [
    institution && institution !== "Unknown" ? institution : null,
    metadata?.accountType ?? null,
    fileType ? fileType.toLowerCase() : null,
    rowCountBand,
    balanceLike ? "balance" : "nobalance",
    amountLike ? "amount" : "noamount",
    firstLine ? firstLine.slice(0, 80) : null,
    lastLine ? lastLine.slice(0, 80) : null,
  ].filter((part): part is string => typeof part === "string" && part.trim().length > 0);

  return signatureParts.length > 0 ? signatureParts.join("|") : null;
};

export const findExistingImportedStatement = async (params: {
  workspaceId: string;
  statementFingerprint: string;
  importFileId?: string | null;
}) => {
  const parsedColumns = new Set(await getCompatibleParsedTransactionColumns());
  const importFileColumns = new Set(await getCompatibleImportFileColumns());
  const supportsStatusGate = importFileColumns.has("status") || importFileColumns.has("confirmedAt");

  if (parsedColumns.has("statementFingerprint") && parsedColumns.has("workspaceId") && supportsStatusGate) {
    const supportsImportFileId = parsedColumns.has("importFileId");
    const completedGateParts: string[] = [];
    if (importFileColumns.has("confirmedAt")) {
      completedGateParts.push(`i."confirmedAt" IS NOT NULL`);
    } else if (importFileColumns.has("status")) {
      completedGateParts.push(`i."status" = 'done'`);
    }

    if (completedGateParts.length > 0 && supportsImportFileId) {
      const rows = await prisma.$queryRawUnsafe<Array<{ importFileId: string | null }>>(
        `SELECT DISTINCT pt."importFileId" FROM "ParsedTransaction" pt INNER JOIN "ImportFile" i ON i."id" = pt."importFileId" LEFT JOIN "Account" a ON a."id" = i."accountId" WHERE pt."workspaceId" = $1 AND pt."statementFingerprint" = $2${params.importFileId ? ' AND pt."importFileId" <> $3' : ""} AND (${completedGateParts.join(" OR ")}) AND i."accountId" IS NOT NULL AND a."id" IS NOT NULL LIMIT 1`,
        ...(params.importFileId ? [params.workspaceId, params.statementFingerprint, params.importFileId] : [params.workspaceId, params.statementFingerprint])
      );

      if (rows.length > 0 && rows[0]?.importFileId !== null) {
        return rows[0]?.importFileId ?? "__duplicate__";
      }
    }
  }

  return null;
};

const scoreSignal = (tokens: string[], normalizedMerchant: string, signal: TrainingSignalRow) => {
  const exactMatch = signal.merchantKey && signal.merchantKey === normalizedMerchant;
  if (exactMatch) {
    return 100 + signal.confidence;
  }

  const signalTokens = new Set(signal.merchantTokens);
  let overlap = 0;

  for (const token of tokens) {
    if (signalTokens.has(token)) {
      overlap += 1;
    }
  }

  if (overlap === 0) {
    return 0;
  }

  return overlap * 18 + signal.confidence * 0.5;
};

const scoreMerchantRule = (tokens: string[], normalizedMerchant: string, rule: MerchantRuleRow) => {
  if (rule.merchantKey === normalizedMerchant) {
    return 120 + rule.confidence;
  }

  const ruleTokens = tokenizeMerchant(rule.merchantPattern || rule.normalizedName || rule.merchantKey);
  const ruleTokenSet = new Set(ruleTokens);
  let overlap = 0;

  for (const token of tokens) {
    if (ruleTokenSet.has(token)) {
      overlap += 1;
    }
  }

  if (overlap === 0) {
    return 0;
  }

  return overlap * 20 + rule.confidence * 0.75 + rule.timesConfirmed;
};

export const classifyMerchant = (params: {
  merchantText: string;
  categoryText?: string | null;
  type: TransactionType;
  categoryName?: string | null;
  merchantRules: MerchantRuleRow[];
  trainingSignals: TrainingSignalRow[];
  negativeSignals?: NegativeMerchantSignalRow[];
}) => {
  const preferredTypeForCategory = (categoryName: string | null | undefined, fallback: TransactionType, categorySource?: string | null) => {
    if (categoryName?.trim().toLowerCase() === "shopping" && isStandaloneCashPaymentDescription(categorySource)) {
      return "expense";
    }

    return coerceTransactionTypeFromCategoryName(categoryName, fallback);
  };
  const categoryText = [params.categoryText, params.merchantText].filter((value) => typeof value === "string" && value.trim()).join(" ");
  const tokens = tokenizeMerchant(categoryText || params.merchantText);
  const normalizedMerchant = normalizeMerchantText(params.merchantText);
  const hardcodedOverride = getHardcodedCategoryOverride(categoryText || params.merchantText);
  const providedCategory = params.categoryName?.trim();
  const heuristicCategory =
    providedCategory && providedCategory.toLowerCase() !== "other" ? providedCategory : guessCategoryFallback(categoryText || params.merchantText, params.type);
  const negativeSignals = params.negativeSignals ?? [];

  let bestRule: MerchantRuleRow | null = null;
  let bestRuleScore = 0;
  let bestSignal: TrainingSignalRow | null = null;
  let bestScore = 0;

  for (const rule of params.merchantRules) {
    const score = scoreMerchantRule(tokens, normalizedMerchant, rule);
    if (score > bestRuleScore) {
      bestRuleScore = score;
      bestRule = rule;
    }
  }

  const scoreNegativeSignal = (signal: NegativeMerchantSignalRow) => {
    if (signal.merchantKey === normalizedMerchant) {
      return 100 + signal.confidence;
    }

    const signalTokens = new Set(signal.merchantTokens);
    let overlap = 0;
    for (const token of tokens) {
      if (signalTokens.has(token)) {
        overlap += 1;
      }
    }

    return overlap === 0 ? 0 : overlap * 18 + signal.confidence * 0.5;
  };

  let negativePenalty = 0;
  for (const signal of negativeSignals) {
    negativePenalty = Math.max(negativePenalty, scoreNegativeSignal(signal));
  }

  if (bestRule && bestRuleScore >= 20) {
    const learnedCategory = bestRule.categoryName ?? heuristicCategory;
    const exact = bestRule.merchantKey === normalizedMerchant;
    const learnedType = params.trainingSignals.find((signal) => signal.merchantKey === normalizedMerchant)?.type ?? params.type;
    const rawConfidence = Math.max(0, bestRuleScore) - Math.min(bestRuleScore * 0.75, negativePenalty * (exact ? 0.9 : 0.65));
    const adjustedConfidence = Math.max(20, Math.round(Math.min(negativePenalty > 0 ? (exact ? 85 : 88) : 99, rawConfidence)));
    return {
      categoryName: learnedCategory,
      confidence: adjustedConfidence,
      categoryReason: exact ? "rule-exact" : "rule-pattern",
      merchantKey: normalizedMerchant,
      merchantTokens: tokens,
      normalizedName: bestRule.normalizedName || summarizeMerchantText(params.merchantText),
      preferredType: preferredTypeForCategory(learnedCategory, learnedType, categoryText || params.merchantText),
    };
  }

  for (const signal of params.trainingSignals) {
    const score = scoreSignal(tokens, normalizedMerchant, signal);
    if (score > bestScore) {
      bestScore = score;
      bestSignal = signal;
    }
  }

  if (bestSignal && bestScore >= 18) {
    const learnedCategory = bestSignal.categoryName ?? heuristicCategory;
    const rawConfidence = Math.max(68, bestScore) - Math.min(bestScore * 0.6, negativePenalty * 0.45);
    const confidence = Math.max(20, Math.round(Math.min(negativePenalty > 0 ? 80 : 99, rawConfidence)));

    return {
      categoryName: learnedCategory,
      confidence,
      categoryReason: bestSignal.merchantKey === normalizedMerchant ? "learned-exact" : "learned-pattern",
      merchantKey: normalizedMerchant,
      merchantTokens: tokens,
      normalizedName: summarizeMerchantText(params.merchantText),
      preferredType: preferredTypeForCategory(learnedCategory, bestSignal.type ?? params.type, categoryText || params.merchantText),
    };
  }

  if (HARDCODED_EXACT_MERCHANT_KEYS.has(normalizedMerchant)) {
    return {
      categoryName: heuristicCategory,
      confidence: 99,
      categoryReason: "hardcoded-exact",
      merchantKey: normalizedMerchant,
      merchantTokens: tokens,
      normalizedName: summarizeMerchantText(params.merchantText),
      preferredType: preferredTypeForCategory(heuristicCategory, params.type, categoryText || params.merchantText),
    };
  }

  if (hardcodedOverride) {
    return {
      categoryName: hardcodedOverride,
      confidence: 99,
      categoryReason: "hardcoded-override",
      merchantKey: normalizedMerchant,
      merchantTokens: tokens,
      normalizedName: summarizeMerchantText(params.merchantText),
      preferredType: preferredTypeForCategory(hardcodedOverride, params.type, categoryText || params.merchantText),
    };
  }

  return {
    categoryName: heuristicCategory,
    confidence: heuristicCategory === "Other" ? 35 : Math.max(35, 62 - Math.min(22, Math.round(negativePenalty * 0.25))),
    categoryReason: heuristicCategory === "Other" ? "heuristic-other" : "heuristic-rule",
    merchantKey: normalizedMerchant,
    merchantTokens: tokens,
    normalizedName: summarizeMerchantText(params.merchantText),
    preferredType: preferredTypeForCategory(heuristicCategory, params.type, categoryText || params.merchantText),
  };
};

export const loadNegativeMerchantSignals = async (workspaceId: string) => {
  try {
    const rows = await prisma.transaction.findMany({
      where: {
        workspaceId,
        reviewStatus: "rejected",
        deletedAt: null,
      },
      select: {
        merchantRaw: true,
        merchantClean: true,
        description: true,
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 250,
    });

    return rows
      .map((row) => {
        const merchantText = row.merchantClean || row.merchantRaw || row.description || "";
        const merchantKey = normalizeMerchantText(merchantText);
        if (!merchantKey) {
          return null;
        }
        return {
          merchantKey,
          merchantTokens: tokenizeMerchant(merchantText),
          source: "rejected_transaction",
          confidence: 80,
        } satisfies NegativeMerchantSignalRow;
      })
      .filter((value): value is NegativeMerchantSignalRow => Boolean(value));
  } catch (error) {
    if (!isMissingDatabaseRelationError(error, "Transaction")) {
      throw error;
    }

    return [];
  }
};

export const loadTrainingSignals = async (workspaceId: string) => {
  const columns = await getCompatibleTrainingSignalColumns();
  if (columns.length === 0) {
    return [];
  }

  let signals: Array<{
    categoryId: string;
    categoryName: string | null;
    merchantKey: string;
    merchantTokens: Prisma.JsonValue | null;
    type: TransactionType;
    source: string;
    confidence: number;
    category: { name: string };
  }> = [];

  try {
    signals = await prisma.trainingSignal.findMany({
      where: { workspaceId },
      include: {
        category: true,
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
  } catch (error) {
    if (!isMissingDatabaseRelationError(error, "TrainingSignal") && !isMissingDatabaseColumnError(error)) {
      throw error;
    }

    return [];
  }

  return signals.map((signal) => ({
    categoryId: signal.categoryId,
    categoryName: signal.category.name,
    merchantKey: signal.merchantKey,
    merchantTokens: Array.isArray(signal.merchantTokens) ? signal.merchantTokens.filter((token): token is string => typeof token === "string") : [],
    type: signal.type,
    source: signal.source,
    confidence: signal.confidence,
  }));
};

export const upsertStatementTemplate = async (params: {
  workspaceId: string;
  fingerprint: string;
  metadata: ReturnType<typeof detectStatementMetadataFromText>;
  fileType?: string | null;
  parserConfig?: Prisma.InputJsonValue | null;
}) => {
  try {
    return await prisma.statementTemplate.upsert({
      where: {
        workspaceId_fingerprint: {
          workspaceId: params.workspaceId,
          fingerprint: params.fingerprint,
        },
      },
      update: {
        fileType: params.fileType ?? null,
        institution: params.metadata.institution,
        accountNumber: params.metadata.accountNumber,
        accountName: params.metadata.accountName,
        parserConfig: params.parserConfig ?? Prisma.DbNull,
        metadata: params.metadata as Prisma.InputJsonValue,
        exampleCount: { increment: 1 },
        successCount: { increment: 1 },
        lastSeenAt: new Date(),
      },
      create: {
        workspaceId: params.workspaceId,
        fingerprint: params.fingerprint,
        fileType: params.fileType ?? null,
        institution: params.metadata.institution,
        accountNumber: params.metadata.accountNumber,
        accountName: params.metadata.accountName,
        parserConfig: params.parserConfig ?? Prisma.DbNull,
        metadata: params.metadata as Prisma.InputJsonValue,
        parserVersion: DATA_ENGINE_VERSION,
      },
    });
  } catch (error) {
    if (isMissingDatabaseRelationError(error, "StatementTemplate")) {
      return null;
    }

    throw error;
  }
};

export const recordStatementTemplateOutcome = async (params: {
  workspaceId: string;
  fingerprint: string;
  outcome: "success" | "failure";
}) => {
  try {
    await prisma.statementTemplate.updateMany({
      where: {
        workspaceId: params.workspaceId,
        fingerprint: params.fingerprint,
      },
      data:
        params.outcome === "failure"
          ? {
              failureCount: { increment: 1 },
              lastSeenAt: new Date(),
            }
          : {
              successCount: { increment: 1 },
              lastSeenAt: new Date(),
            },
    });
  } catch (error) {
    if (isMissingDatabaseRelationError(error, "StatementTemplate")) {
      return;
    }

    throw error;
  }
};

export const scoreStatementTemplateCandidate = (params: {
  template: StatementTemplateRow;
  institution?: string | null;
  fileType?: string | null;
  accountType?: ImportedAccountType | null;
  statementFamilySignature?: string | null;
}) => {
  const institution = sanitizeBankNameLabel(params.institution ?? null);
  let score = 0;

  if (params.template.institution && institution && normalizeMerchantText(params.template.institution) === normalizeMerchantText(institution)) {
    score += 40;
  }

  if (params.fileType && params.template.fileType && params.template.fileType === params.fileType) {
    score += 20;
  }

  const parserConfig =
    params.template.parserConfig && typeof params.template.parserConfig === "object" && !Array.isArray(params.template.parserConfig)
      ? (params.template.parserConfig as Record<string, unknown>)
      : null;
  const templateAccountType = typeof parserConfig?.accountType === "string" ? parserConfig.accountType.trim().toLowerCase() : null;
  const rowCount = typeof parserConfig?.rowCount === "number" ? parserConfig.rowCount : null;
  const templateFamilySignature = typeof parserConfig?.statementFamilySignature === "string" ? parserConfig.statementFamilySignature.trim() : null;

  if (params.accountType && templateAccountType === params.accountType.toLowerCase()) {
    score += 18;
  }

  if (typeof rowCount === "number") {
    score += Math.min(10, Math.max(0, 10 - Math.floor(Math.abs(rowCount - 20) / 5)));
  }

  if (params.statementFamilySignature && templateFamilySignature) {
    if (params.statementFamilySignature === templateFamilySignature) {
      score += 30;
    } else {
      const familyParts = params.statementFamilySignature.split("|").filter(Boolean);
      const templateParts = templateFamilySignature.split("|").filter(Boolean);
      const overlap = familyParts.filter((part) => templateParts.includes(part)).length;
      score += Math.min(12, overlap * 3);
    }
  }

  const successCount = Math.max(0, Math.round(params.template.successCount ?? 0));
  const failureCount = Math.max(0, Math.round(params.template.failureCount ?? 0));
  const totalRuns = successCount + failureCount;
  const reliability = totalRuns > 0 ? successCount / totalRuns : 1;
  const balance = successCount - failureCount;

  score += Math.min(14, Math.round(successCount * 1.6 + Math.max(0, params.template.exampleCount ?? 0) * 0.75));
  score += Math.round(reliability * 8);
  if (failureCount > 0) {
    score -= Math.min(18, Math.round(failureCount * 2.5 + (1 - reliability) * 8));
  }
  if (balance < 0) {
    score -= Math.min(12, Math.abs(balance) * 2);
  }

  return score;
};

export const recordTrainingSignal = async (params: {
  workspaceId: string;
  importFileId?: string | null;
  transactionId?: string | null;
  merchantText: string;
  normalizedName?: string | null;
  categoryId: string;
  categoryName?: string | null;
  type: TransactionType;
  source: "import_confirmation" | "manual_recategorization" | "training_upload" | "manual_transaction_creation";
  confidence?: number;
  teachabilityScore?: number | null;
  notes?: string | null;
  actorUserId?: string | null;
}) => {
  const teachabilityScore =
    typeof params.teachabilityScore === "number" && Number.isFinite(params.teachabilityScore)
      ? Math.max(0, Math.min(100, Math.round(params.teachabilityScore)))
      : null;
  if (!shouldPromoteTrainingSignalForLearning({ confidence: params.confidence ?? null, teachabilityScore, merchantText: params.merchantText })) {
    return null;
  }
  const merchantKey = normalizeMerchantText(params.merchantText);
  const merchantTokens = tokenizeMerchant(params.merchantText);
  const normalizedMerchantLabel = params.normalizedName?.trim() || summarizeMerchantText(params.merchantText);
  const dedupeKey = buildTrainingSignalDedupeKey({
    source: params.source,
    transactionId: params.transactionId ?? null,
    importFileId: params.importFileId ?? null,
    merchantKey,
    categoryId: params.categoryId,
    type: params.type,
  });

  const columns = await getCompatibleTrainingSignalColumns();
  if (columns.length === 0) {
    return null;
  }

  if (!columns.includes("dedupeKey")) {
    return null;
  }

  const signalData = {
    workspaceId: params.workspaceId,
    importFileId: params.importFileId ?? null,
    transactionId: params.transactionId ?? null,
    source: params.source,
    merchantKey,
    dedupeKey,
    merchantTokens: merchantTokens as Prisma.InputJsonValue,
    categoryId: params.categoryId,
    categoryName: params.categoryName ?? null,
    type: params.type,
    confidence: params.confidence ?? 100,
    notes: params.notes ?? null,
  };

  const signal = await prisma.trainingSignal.upsert({
    where: {
      workspaceId_dedupeKey: {
        workspaceId: params.workspaceId,
        dedupeKey,
      },
    },
    create: signalData,
    update: {
      importFileId: params.importFileId ?? null,
      transactionId: params.transactionId ?? null,
      source: params.source,
      merchantKey,
      merchantTokens: merchantTokens as Prisma.InputJsonValue,
      categoryId: params.categoryId,
      categoryName: params.categoryName ?? null,
      type: params.type,
      confidence: params.confidence ?? 100,
      notes: params.notes ?? null,
    },
  });

  const category = await prisma.category.findUnique({
    where: { id: params.categoryId },
  });

  if (category) {
    const existingRule = await prisma.merchantRule.findUnique({
      where: {
        workspaceId_merchantKey: {
          workspaceId: params.workspaceId,
          merchantKey,
        },
      },
      select: {
        id: true,
      },
    });

    await upsertMerchantRule({
      workspaceId: params.workspaceId,
      merchantText: params.merchantText,
      normalizedName: normalizedMerchantLabel || params.merchantText,
      categoryId: params.categoryId,
      categoryName: params.categoryName ?? category.name,
      source: params.source,
      confidence: params.confidence ?? 100,
    });

    const prototypeLabel = buildMerchantPrototypeLabel(params.merchantText, normalizedMerchantLabel);
    if (prototypeLabel) {
      await upsertMerchantRule({
        workspaceId: params.workspaceId,
        merchantText: prototypeLabel,
        normalizedName: normalizedMerchantLabel || prototypeLabel,
        categoryId: params.categoryId,
        categoryName: params.categoryName ?? category.name,
        source: `${params.source}:prototype`,
        confidence: Math.max(60, (params.confidence ?? 100) - 10),
      });
    }

    if (params.actorUserId) {
      void capturePostHogServerEvent(existingRule ? "merchant_rule_updated" : "merchant_rule_created", params.actorUserId, {
        workspace_id: params.workspaceId,
        merchant_key: merchantKey,
        category_id: params.categoryId,
        category_name: params.categoryName ?? category.name,
        source: params.source,
        confidence: params.confidence ?? 100,
        times_confirmed: 1,
      });

      void capturePostHogServerEvent("merchant_rule_applied", params.actorUserId, {
        workspace_id: params.workspaceId,
        merchant_key: merchantKey,
        category_id: params.categoryId,
        category_name: params.categoryName ?? category.name,
        source: params.source,
        confidence: params.confidence ?? 100,
      });

      void capturePostHogServerEvent("category_rule_applied", params.actorUserId, {
        workspace_id: params.workspaceId,
        category_id: params.categoryId,
        category_name: params.categoryName ?? category.name,
        source: params.source,
        confidence: params.confidence ?? 100,
      });
    }
  }

  return signal;
};

type DataQaReviewEntry = {
  correct?: boolean;
  feedback?: string;
  output?: unknown;
};

type DataQaReviewTransactionEntry = DataQaReviewEntry & {
  output?: {
    transactionName?: string | null;
    normalizedName?: string | null;
    date?: string | null;
    category?: string | null;
    type?: string | null;
    amount?: string | null;
  } | null;
};

type DataQaReviewPayload = {
  bank?: DataQaReviewEntry;
  accountNumber?: DataQaReviewEntry;
  accountType?: DataQaReviewEntry;
  accountBalance?: DataQaReviewEntry;
  transactionCount?: DataQaReviewEntry;
  transactions?: DataQaReviewTransactionEntry[];
  additionalTransactions?: DataQaReviewTransactionEntry[];
  manualFeedback?: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizeReviewText = (value: unknown) => normalizeWhitespace(String(value ?? ""));

const readReviewString = (value: unknown, key: string) => {
  if (!isRecord(value)) {
    return null;
  }

  const next = value[key];
  return typeof next === "string" && next.trim() ? next.trim() : null;
};

const readReviewBoolean = (value: unknown, key: string) => {
  if (!isRecord(value)) {
    return false;
  }

  return Boolean(value[key]);
};

const readReviewOutputText = (value: unknown) => {
  if (!isRecord(value)) {
    return null;
  }

  const next = value.output;
  if (typeof next === "string" && next.trim()) {
    return next.trim();
  }

  if (isRecord(next)) {
    const candidate = next.output ?? next.value ?? next.text ?? next.accountNumber ?? next.bank ?? next.amount;
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return String(candidate);
    }
  }

  return null;
};

const normalizeImportedAccountType = (value: unknown): ImportedAccountType => {
  const normalized = normalizeReviewText(value).toLowerCase();

  if (
    normalized === "bank" ||
    normalized === "wallet" ||
    normalized === "credit_card" ||
    normalized === "cash" ||
    normalized === "investment" ||
    normalized === "other"
  ) {
    return normalized;
  }

  if (
    normalized === "loan" ||
    normalized === "mortgage" ||
    normalized === "line_of_credit" ||
    normalized === "receivable" ||
    normalized === "payable" ||
    normalized === "bnpl" ||
    normalized === "prepaid" ||
    normalized === "insurance"
  ) {
    return "other";
  }

  return "bank";
};

const normalizeTransactionType = (value: unknown, amount?: unknown, categoryName?: unknown): TransactionType =>
  coerceTransactionTypeFromCategoryName(categoryName, toInternalTransactionType(value, amount));

export const applyDataQaReviewLearning = async (params: {
  workspaceId: string;
  importFileId?: string | null;
  accountId?: string | null;
  fileName: string;
  fileType: string;
  metadata: DetectedStatementMetadata;
  parsedRows: Array<Record<string, unknown>>;
  fieldReviewPayload?: Prisma.JsonValue | null;
  manualFeedback?: string | null;
  actorUserId?: string | null;
  statementFingerprint?: string | null;
  statementMetadataOverride?: Partial<DetectedStatementMetadata> | null;
}) => {
  const review = isRecord(params.fieldReviewPayload) ? (params.fieldReviewPayload as DataQaReviewPayload) : {};
  const effectiveMetadata = {
    ...params.metadata,
    ...(params.statementMetadataOverride ?? {}),
  } as DetectedStatementMetadata;
  const bankName = readReviewOutputText(review.bank) ?? normalizeReviewText(effectiveMetadata.institution);
  const accountName = normalizeReviewText(effectiveMetadata.accountName || effectiveMetadata.institution || params.fileName);
  const accountNumber = readReviewOutputText(review.accountNumber) ?? normalizeReviewText(effectiveMetadata.accountNumber);
  const accountType = normalizeImportedAccountType(readReviewOutputText(review.accountType) ?? effectiveMetadata.accountType ?? "bank");
  const accountBalance = readReviewOutputText(review.accountBalance);
  const reviewSeed = [
    `bank:${bankName}`,
    `account:${accountName}`,
    `account_number:${accountNumber}`,
    `account_type:${accountType}`,
    `opening_balance:${effectiveMetadata.openingBalance ?? ""}`,
    `ending_balance:${effectiveMetadata.endingBalance ?? ""}`,
    `rows:${params.parsedRows.length}`,
    ...params.parsedRows.slice(0, 12).map((row, index) => {
      const record = isRecord(row) ? row : {};
      return [
        `row:${index + 1}`,
        normalizeReviewText(record.merchantClean ?? record.merchantRaw ?? record.description ?? record.name),
        normalizeReviewText(record.categoryName ?? record.category ?? record.normalizedCategory),
        normalizeReviewText(record.date ?? record.transactionDate ?? record.postedDate ?? record.statementDate),
        normalizeReviewText(record.amount ?? record.value ?? record.total),
      ]
        .filter((part) => part.length > 0)
        .join("|");
    }),
  ]
    .filter((part) => part.length > 0)
    .join("\n");

  const fingerprintMetadata: StatementMetadataSnapshot = {
    institution: bankName || (effectiveMetadata.institution ?? null),
    accountNumber: accountNumber || (effectiveMetadata.accountNumber ?? null),
    accountName: effectiveMetadata.accountName ?? null,
    accountType: accountType,
    currency: effectiveMetadata.currency ?? null,
    openingBalance: effectiveMetadata.openingBalance ?? null,
    endingBalance: accountBalance ? parseAmountValue(accountBalance) ?? effectiveMetadata.endingBalance ?? null : effectiveMetadata.endingBalance ?? null,
    paymentDueDate: effectiveMetadata.paymentDueDate ?? null,
    totalAmountDue: effectiveMetadata.totalAmountDue ?? null,
    startDate: effectiveMetadata.startDate ?? null,
    endDate: effectiveMetadata.endDate ?? null,
    confidence: effectiveMetadata.confidence ?? 0,
  };

  const statementTemplate = await upsertStatementTemplate({
    workspaceId: params.workspaceId,
    fingerprint:
      params.statementFingerprint ??
      buildStatementFingerprint(reviewSeed, fingerprintMetadata, params.fileName, params.fileType),
    metadata: fingerprintMetadata,
    fileType: params.fileType,
    parserConfig: {
      source: "data_qa_review",
      rowCount: params.parsedRows.length,
      statementFamilySignature: buildStatementFamilySignature({
        rows: params.parsedRows as ParsedImportRow[],
        metadata: {
          institution: fingerprintMetadata.institution ?? null,
          accountType: fingerprintMetadata.accountType ?? null,
          startDate: fingerprintMetadata.startDate ?? null,
          endDate: fingerprintMetadata.endDate ?? null,
        },
        fileType: params.fileType,
      }),
      importFileId: params.importFileId ?? null,
      accountId: params.accountId ?? null,
      manualFeedback: Boolean(params.manualFeedback?.trim()),
      correctedFields: {
        bank: readReviewBoolean(review.bank, "correct"),
        accountNumber: readReviewBoolean(review.accountNumber, "correct"),
        accountType: readReviewBoolean(review.accountType, "correct"),
        accountBalance: readReviewBoolean(review.accountBalance, "correct"),
        transactionCount: readReviewBoolean(review.transactionCount, "correct"),
        transactionRows: Array.isArray(review.transactions) ? review.transactions.filter((entry) => readReviewBoolean(entry, "correct")).length : 0,
      },
    } as Prisma.InputJsonValue,
  });

  const accountRule = await upsertAccountRule({
    workspaceId: params.workspaceId,
    accountId: params.accountId ?? null,
    accountName,
    institution: bankName || null,
    accountType,
    source: "data_qa_review",
    confidence: readReviewBoolean(review.bank, "correct") || readReviewBoolean(review.accountNumber, "correct") || readReviewBoolean(review.accountType, "correct") ? 100 : 85,
  });

  const categories = await prisma.category.findMany({
    where: { workspaceId: params.workspaceId },
    select: {
      id: true,
      name: true,
    },
  });
  const categoriesByName = new Map(categories.map((category) => [normalizeMerchantText(category.name), category] as const));

  const trainingSignals: Array<Promise<unknown>> = [];
  const transactionReviews = Array.isArray(review.transactions) ? review.transactions : [];

  for (let index = 0; index < Math.min(transactionReviews.length, params.parsedRows.length); index += 1) {
    const reviewRow = transactionReviews[index];
    if (!readReviewBoolean(reviewRow, "correct")) {
      continue;
    }

    const parsedRow = params.parsedRows[index];
    const parsedRecord = isRecord(parsedRow) ? parsedRow : {};
    const parsedMerchantText = normalizeReviewText(parsedRecord.merchantRaw ?? parsedRecord.description ?? parsedRecord.name ?? parsedRecord.merchantClean);
    const parsedNormalizedText = normalizeReviewText(parsedRecord.merchantClean ?? parsedRecord.normalizedName ?? parsedRecord.normalizedMerchant ?? parsedRecord.merchantRaw);
    const categoryName =
      readReviewString(reviewRow.output, "category") ??
      normalizeReviewText(parsedRecord.categoryName ?? parsedRecord.category ?? parsedRecord.normalizedCategory);
    const category = categoriesByName.get(normalizeMerchantText(categoryName)) ?? null;
    const merchantText =
      parsedMerchantText ||
      readReviewString(reviewRow.output, "transactionName") ||
      readReviewString(reviewRow.output, "normalizedName") ||
      normalizeReviewText(parsedRecord.merchantClean ?? parsedRecord.merchantRaw ?? parsedRecord.description ?? parsedRecord.name);
    const normalizedName =
      readReviewString(reviewRow.output, "normalizedName") ??
      readReviewString(reviewRow.output, "transactionName") ??
      (parsedNormalizedText || parsedMerchantText);
    const type = normalizeTransactionType(
      readReviewString(reviewRow.output, "type") ?? parsedRecord.type ?? parsedRecord.transactionType ?? "expense",
      parsedRecord.amount ?? parsedRecord.value ?? parsedRecord.total,
      categoryName
    );

    if (!category || !merchantText) {
      continue;
    }

    const parsedRowPreview = {
      merchantRaw: merchantText,
      merchantClean: normalizedName ?? merchantText,
      categoryName,
      type,
      amount: parsedRecord.amount ?? parsedRecord.value ?? parsedRecord.total ?? null,
      date: parsedRecord.date ?? parsedRecord.transactionDate ?? parsedRecord.postedDate ?? parsedRecord.statementDate ?? null,
    } as ParsedImportRow;
    const teachability = assessParsedRowTeachability(parsedRowPreview);
    if (teachability.score < 55) {
      continue;
    }

    trainingSignals.push(
      recordTrainingSignal({
        workspaceId: params.workspaceId,
        importFileId: params.importFileId ?? null,
        merchantText,
        normalizedName,
        categoryId: category.id,
        categoryName: category.name,
        type,
        source: "manual_recategorization",
        confidence: Math.max(60, (readReviewString(reviewRow, "feedback") ? 90 : 100) - scoreRowShapeLearningPenalty(teachability.score)),
        notes:
          readReviewString(reviewRow, "feedback") ??
          "Confirmed through Data QA review.",
        actorUserId: params.actorUserId ?? null,
      })
    );
  }

  const additionalTransactions = Array.isArray(review.additionalTransactions) ? review.additionalTransactions : [];
  for (const reviewRow of additionalTransactions) {
    const output = isRecord(reviewRow) && isRecord(reviewRow.output) ? reviewRow.output : null;
    const categoryName =
      readReviewString(output, "category") ??
      normalizeReviewText((output as Record<string, unknown> | null)?.category);
    const category = categoriesByName.get(normalizeMerchantText(categoryName)) ?? null;
    const merchantText =
      readReviewString(output, "transactionName") ??
      readReviewString(output, "normalizedName") ??
      "";
    const type = normalizeTransactionType(
      readReviewString(output, "type") ?? "expense",
      output && isRecord(output) ? output.amount : null,
      categoryName
    );

    if (!category || !merchantText) {
      continue;
    }

    const parsedRowPreview = {
      merchantRaw: merchantText,
      merchantClean: normalizedName ?? merchantText,
      categoryName,
      type,
      amount: output && isRecord(output) ? output.amount : null,
      date: output && isRecord(output) ? output.date ?? null : null,
    } as ParsedImportRow;
    const teachability = assessParsedRowTeachability(parsedRowPreview);
    if (teachability.score < 55) {
      continue;
    }

    trainingSignals.push(
      recordTrainingSignal({
        workspaceId: params.workspaceId,
        importFileId: params.importFileId ?? null,
        merchantText,
        categoryId: category.id,
        categoryName: category.name,
        type,
        source: "manual_transaction_creation",
        confidence: Math.max(60, (readReviewBoolean(reviewRow, "correct") ? 100 : 90) - scoreRowShapeLearningPenalty(teachability.score)),
        notes:
          readReviewString(reviewRow, "feedback") ??
          "Added manually from Data QA because the parser missed this transaction.",
        actorUserId: params.actorUserId ?? null,
      })
    );
  }

  await Promise.allSettled(trainingSignals);

  if (params.actorUserId) {
    await prisma.auditLog.create({
      data: {
        workspaceId: params.workspaceId,
        actorUserId: params.actorUserId,
        action: "data_qa.feedback_learning_applied",
        entity: "DataQaRun",
        entityId: params.importFileId ?? statementTemplate?.id ?? null,
        metadata: {
          importFileId: params.importFileId ?? null,
          accountId: params.accountId ?? null,
          statementTemplateId: statementTemplate?.id ?? null,
          accountRuleId: accountRule?.id ?? null,
          manualFeedback: Boolean(params.manualFeedback?.trim()),
          transactionSignals: trainingSignals.length,
        },
      },
    });
  }

  return {
    statementTemplateId: statementTemplate?.id ?? null,
    accountRuleId: accountRule?.id ?? null,
    transactionSignals: trainingSignals.length,
  };
};

export const enrichParsedRowsWithTraining = async (params: {
  workspaceId: string;
  rows: ParsedImportRow[];
  statementConfidence?: number;
}) => {
  const merchantRules = await loadMerchantRules(params.workspaceId);
  const accountRules = await loadAccountRules(params.workspaceId);
  const trainingSignals = await loadTrainingSignals(params.workspaceId);
  const negativeSignals = await loadNegativeMerchantSignals(params.workspaceId);
  const rawStatementConfidence =
    typeof params.statementConfidence === "number" && Number.isFinite(params.statementConfidence)
      ? Math.max(0, Math.min(100, params.statementConfidence))
      : 0;
  const statementConfidence = rawStatementConfidence > 0 ? rawStatementConfidence : 100;
  const rowShapeAssessment = assessParsedRowShapeConsistency(params.rows);
  const normalizeConfidenceScore = (value: unknown) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return 0;
    }

    const scaled = value > 0 && value <= 1 ? value * 100 : value;
    return Math.max(0, Math.min(100, Math.round(scaled)));
  };

  const rowShapePenalty = scoreRowShapeLearningPenalty(rowShapeAssessment.score);

  const isRowLowConfidence = (details: {
    effectiveConfidence: number;
    categoryName: string;
    categoryReason?: string | null;
    rowType?: ParsedImportRow["type"];
    teachabilityScore?: number;
  }) => {
    if (!details.rowType) {
      return true;
    }

    if (rowShapeAssessment.score < 65) {
      return true;
    }

    if (typeof details.teachabilityScore === "number" && details.teachabilityScore < 55) {
      return true;
    }

    if (!details.categoryName || details.categoryName.trim().toLowerCase() === "other") {
      return true;
    }

    return details.effectiveConfidence < 70;
  };

  return params.rows.map((row) => {
    const rowWithInstitution = row as ParsedImportRow & {
      institution?: string | null;
      normalizedPayload?: Prisma.JsonValue | null;
      parserConfidence?: number | null;
      categoryConfidence?: number | null;
    };
    const merchantText = row.merchantRaw || row.description || row.merchantClean || "";
    const normalizedPayload =
      rowWithInstitution.normalizedPayload &&
      typeof rowWithInstitution.normalizedPayload === "object" &&
      !Array.isArray(rowWithInstitution.normalizedPayload)
        ? (rowWithInstitution.normalizedPayload as Record<string, unknown>)
        : null;
    const categoryText = [
      row.merchantRaw,
      row.merchantClean,
      row.description,
      typeof normalizedPayload?.merchantClean === "string" ? normalizedPayload.merchantClean : null,
      typeof normalizedPayload?.categoryName === "string" ? normalizedPayload.categoryName : null,
    ]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join(" ");
    const accountMatch = findBestAccountRule(row.accountName ?? null, rowWithInstitution.institution ?? null, accountRules);
    const rowTeachability = assessParsedRowTeachability(row);
    const learned = rowTeachability.score < 55
      ? {
          categoryName: row.categoryName && row.categoryName.trim().toLowerCase() !== "other" ? row.categoryName : null,
          confidence: Math.max(20, rowTeachability.score),
          categoryReason: "row_teachability_blocked",
          merchantKey: normalizeMerchantText(merchantText),
          merchantTokens: tokenizeMerchant(merchantText),
          normalizedName: summarizeMerchantText(merchantText, rowWithInstitution.institution ?? null),
          preferredType: row.type ?? "expense",
        }
      : classifyMerchant({
          merchantText,
          categoryText,
          type: row.type ?? "expense",
          categoryName: row.categoryName ?? null,
          merchantRules,
          trainingSignals,
          negativeSignals,
        });
    const merchantClean = learned.normalizedName || summarizeMerchantText(merchantText, rowWithInstitution.institution ?? null);
    const categoryName = learned.categoryName || row.categoryName || defaultCategoryForType(learned.preferredType ?? row.type ?? "expense");
    const nextType = coerceTransactionTypeFromCategoryName(
      categoryName,
      learned.preferredType ?? row.type ?? "expense"
    );
    const accountName = row.accountName ?? null;
    const parserCategoryName = typeof row.categoryName === "string" ? row.categoryName.trim() : "";
    const parserSuppliedConcreteCategory = Boolean(parserCategoryName) && parserCategoryName.toLowerCase() !== "other";
    const rowConfidence = normalizeConfidenceScore(row.confidence);
    const rowParserConfidence = normalizeConfidenceScore(rowWithInstitution.parserConfidence);
    const rowCategoryConfidence = normalizeConfidenceScore(rowWithInstitution.categoryConfidence);
    const deterministicParserConfidence = parserSuppliedConcreteCategory
      ? Math.max(rowConfidence, rowParserConfidence, rowCategoryConfidence, Math.min(95, Math.max(90, statementConfidence)))
      : 0;
    const shapeConfidence = Math.max(0, Math.min(100, rowShapeAssessment.score));
    const teachabilityPenalty = scoreRowShapeLearningPenalty(rowTeachability.score);
    const effectiveConfidence = Math.max(
      0,
      Math.min(
        100,
        Math.max(learned.confidence, deterministicParserConfidence, rowConfidence, rowCategoryConfidence, Math.round(shapeConfidence * 0.25)) -
          rowShapePenalty -
          teachabilityPenalty
      )
    );
    const parserConfidence = Math.max(
      0,
      Math.max(rowParserConfidence, rowConfidence, statementConfidence, Math.round(shapeConfidence * 0.2)) -
        Math.floor(rowShapePenalty * 0.5) -
        Math.floor(teachabilityPenalty * 0.5)
    );
    const categoryConfidence = Math.max(rowCategoryConfidence, effectiveConfidence);
    const learnedRuleIdsApplied = [
      ...(Array.isArray(row.learnedRuleIdsApplied) ? (row.learnedRuleIdsApplied as string[]) : []),
      ...(accountMatch ? [`account-rule:${accountMatch.rule.ruleKey}`] : []),
    ];
    return {
      ...row,
      merchantClean: merchantClean || undefined,
      accountName: accountMatch?.rule.accountName ?? accountName ?? undefined,
      institution: rowWithInstitution.institution ?? accountMatch?.rule.institution ?? undefined,
      categoryName,
      confidence: effectiveConfidence,
      categoryReason: learned.categoryReason,
      parserVersion: DATA_ENGINE_VERSION,
      reviewStatus: isRowLowConfidence({
        effectiveConfidence,
        categoryName,
        categoryReason: learned.categoryReason,
        rowType: nextType,
        teachabilityScore: rowTeachability.score,
      })
        ? "pending_review"
        : "suggested",
      parserConfidence,
      categoryConfidence,
      accountMatchConfidence: accountMatch ? Math.min(99, Math.round(Math.max(70, accountMatch.score))) : 0,
      duplicateConfidence: 0,
      transferConfidence: nextType === "transfer" ? 100 : 0,
      rowShapeConfidence: shapeConfidence,
      rowTeachabilityConfidence: rowTeachability.score,
      learnedRuleIdsApplied,
      normalizedPayload: {
        merchantClean: merchantClean || null,
        categoryName,
        type: nextType,
        accountName: accountMatch?.rule.accountName ?? accountName ?? null,
        institution: row.institution ?? accountMatch?.rule.institution ?? null,
      } as Prisma.InputJsonValue,
      rawPayload: {
        ...(row.rawPayload ?? {}),
        classification: {
          engineVersion: DATA_ENGINE_VERSION,
          merchantKey: learned.merchantKey,
          merchantTokens: learned.merchantTokens,
          categoryReason: learned.categoryReason,
          confidence: effectiveConfidence,
          accountRuleKey: accountMatch?.rule.ruleKey ?? null,
          accountRuleConfidence: accountMatch ? Math.round(accountMatch.score) : null,
          statementConfidence,
          normalizedName: merchantClean || null,
          preferredType: nextType,
          rowTeachability: {
            score: rowTeachability.score,
            issues: rowTeachability.issues,
          },
        },
      },
      type: nextType,
    } satisfies EnrichedParsedImportRow;
  });
};
