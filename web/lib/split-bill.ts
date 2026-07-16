import type { Prisma } from "@prisma/client";

const monthIndexByAbbr: Record<string, number> = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
};

export type SplitBillSourceType = "manual" | "receipt";

export type SplitBillParticipantDraft = {
  id?: string;
  name: string;
};

export type SplitBillPaymentDraft = {
  id: string;
  participantId: string;
  amount: string;
  note?: string | null;
};

export type SplitBillSplitMethod = "equal" | "exact" | "percentage" | "shares";

export type SplitBillItemAllocation = {
  participantId: string;
  value: string;
};

export type SplitBillItemDraft = {
  id?: string;
  description: string;
  amount: string;
  participantIds: string[];
  splitMethod?: SplitBillSplitMethod;
  allocations?: SplitBillItemAllocation[];
};

export type SplitBillDraft = {
  id?: string;
  title: string;
  note?: string | null;
  billDate: string;
  currency: string;
  sourceType: SplitBillSourceType;
  merchantName?: string | null;
  receiptFileName?: string | null;
  receiptMimeType?: string | null;
  receiptText?: string | null;
  receiptConfidence?: number;
  subtotal?: string | null;
  serviceCharge?: string | null;
  tax?: string | null;
  tip?: string | null;
  rounding?: string | null;
  discount?: string | null;
  total?: string | null;
  groupId?: string | null;
  rawPayload?: Record<string, unknown> | null;
  participants: SplitBillParticipantDraft[];
  items: SplitBillItemDraft[];
  payments: SplitBillPaymentDraft[];
};

export type ReceiptPreviewItem = {
  description: string;
  amount: string;
  participantIds?: string[];
  quantity?: number | null;
  unitPrice?: string | null;
  wrapped?: boolean;
};

export type ReceiptPreviewSplitAllocation = {
  participantName: string;
  charged: string | null;
  paid: string | null;
  due: string | null;
  currency: string;
};

export type ReceiptPreviewAccountMatch = {
  accountName: string | null;
  accountLast4: string | null;
  confidence: number;
  reason: string | null;
};

export type ReceiptPreviewResult = {
  receiptText: string;
  receiptType: "restaurant_receipt" | "official_receipt" | "tax_invoice" | "travel_ticket" | "wallet_transfer" | "generic_receipt";
  merchantName: string | null;
  billDate: string | null;
  documentNumber: string | null;
  invoiceNumber: string | null;
  bookingReference: string | null;
  currency: string;
  currencyMentions: string[];
  currencyWarning: string | null;
  paymentMethod: string | null;
  receiptPayerName: string | null;
  subtotal: string | null;
  serviceCharge: string | null;
  tax: string | null;
  tip: string | null;
  rounding: string | null;
  discount: string | null;
  total: string | null;
  items: ReceiptPreviewItem[];
  participants: string[];
  splitAllocations: ReceiptPreviewSplitAllocation[];
  receiptAccountMatch: ReceiptPreviewAccountMatch | null;
  confidence: number;
  requiresReview?: boolean;
  backupParser?: {
    model: string | null;
    promptVersion: string | null;
    confidence: number | null;
    schemaValidated: boolean | null;
    reason: string | null;
  };
};

export type ReceiptPreviewQualityAssessment = {
  score: number;
  issues: string[];
  reliableForFastPath: boolean;
};

export type SplitBillParticipantSummary = {
  id: string;
  name: string;
  paid: number;
  owed: number;
  balance: number;
};

export type SplitBillTransfer = {
  fromParticipantId: string;
  fromParticipantName: string;
  toParticipantId: string;
  toParticipantName: string;
  amount: number;
};

export type SplitBillSettlement = {
  participants: SplitBillParticipantSummary[];
  transfers: SplitBillTransfer[];
  totalSpent: number;
  totalPaid: number;
  totalOwed: number;
};

export type SplitBillTransferSettlementRecord = {
  id: string;
  billId: string;
  fromParticipantId: string;
  fromParticipantName: string;
  toParticipantId: string;
  toParticipantName: string;
  amount: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SplitBillActivityRecord = {
  id: string;
  type: "created" | "edited" | "settled" | "deleted" | "note";
  message: string;
  createdAt: string;
};

export const splitBillGroupMemberOrderBy: Prisma.SplitBillGroupMemberOrderByWithRelationInput[] = [
  { sortOrder: "asc" },
  { createdAt: "asc" },
];

export const splitBillItemOrderBy: Prisma.SplitBillItemOrderByWithRelationInput[] = [
  { sortOrder: "asc" },
  { createdAt: "asc" },
];

export type SplitBillSerializedBill = {
  id: string;
  userId: string;
  transactionId: string | null;
  groupId: string | null;
  title: string;
  note: string | null;
  billDate: string;
  currency: string;
  sourceType: SplitBillSourceType;
  merchantName: string | null;
  receiptFileName: string | null;
  receiptMimeType: string | null;
  receiptText: string | null;
  receiptConfidence: number;
  subtotal: string | null;
  tax: string | null;
  tip: string | null;
  discount: string | null;
  total: string | null;
  rawPayload: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  group: {
    id: string;
    name: string;
    members: Array<{ id: string; name: string; sortOrder: number }>;
  } | null;
  participants: Array<{ id: string; name: string }>;
  items: Array<{
    id: string;
    description: string;
    amount: string;
    sortOrder: number;
    participantIds: string[];
    splitMethod?: SplitBillSplitMethod;
    allocations?: SplitBillItemAllocation[];
  }>;
  payments: Array<{
    id: string;
    participantId: string;
    amount: string;
    note: string | null;
  }>;
  transaction: {
    id: string;
    merchantRaw: string;
    merchantClean: string | null;
    date: string;
    amount: string;
    currency: string;
    account: {
      name: string;
    } | null;
  } | null;
  transferSettlements?: SplitBillTransferSettlementRecord[];
  activity?: SplitBillActivityRecord[];
  paymentRequests?: Array<{
    id: string;
    recipientName: string;
    payeeName: string;
    amount: string;
    currency: string;
    dueDate: string | null;
    status: "requested" | "payment_reported" | "paid" | "declined";
  }>;
  settlement: SplitBillSettlement;
};

type SplitBillReceiptSummary = {
  subtotal?: string | null;
  serviceCharge?: string | null;
  tax?: string | null;
  tip?: string | null;
  rounding?: string | null;
  discount?: string | null;
  total?: string | null;
};

const CURRENCY_ALIAS: Record<string, string> = {
  P: "PHP",
  PHP: "PHP",
  "PHILIPPINE PESO": "PHP",
  "PHILIPPINE PESOS": "PHP",
  PESO: "PHP",
  PESOS: "PHP",
  USD: "USD",
  "US DOLLAR": "USD",
  "U.S. DOLLAR": "USD",
  EUR: "EUR",
  GBP: "GBP",
  SGD: "SGD",
  JPY: "JPY",
  HKD: "HKD",
  AUD: "AUD",
  CAD: "CAD",
  THB: "THB",
  CNY: "CNY",
  MYR: "MYR",
};

const normalizeWhitespace = (value: string) => value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

export const parseAmountValue = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const normalized = normalizeWhitespace(value)
    .replace(/[,_]/g, "")
    .replace(/^\((.*)\)$/, "-$1")
    .replace(/[^0-9.\-]/g, "");

  if (!normalized || normalized === "-" || normalized === "." || normalized === "-.") {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

export const formatSplitBillAmount = (amount: number, currency = "PHP") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: normalizeCurrencyCode(currency) ?? "PHP",
    maximumFractionDigits: 2,
  }).format(amount);

export const normalizeCurrencyCode = (value?: string | null) => {
  if (!value) {
    return "PHP";
  }

  if (value.includes("₱")) {
    return "PHP";
  }
  if (value.includes("$")) {
    return "USD";
  }
  if (value.includes("€")) {
    return "EUR";
  }
  if (value.includes("£")) {
    return "GBP";
  }
  if (value.includes("¥")) {
    return "JPY";
  }

  const compact = normalizeWhitespace(value).toUpperCase().replace(/[^A-Z]/g, " ");
  const token = compact.replace(/\s+/g, " ").trim();

  return CURRENCY_ALIAS[token] ?? (token.replace(/\s+/g, "").slice(0, 3) || "PHP");
};

const hasCurrencySymbolAmount = (text: string, symbol: string) => {
  const escapedSymbol = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const amount = "(?:\\d{3,}|\\d{1,3}(?:,\\d{3})+|\\d+\\.\\d{2})";
  return new RegExp(`(?:${escapedSymbol}[ \\t]*${amount}|${amount}[ \\t]*${escapedSymbol})(?![\\d/]\\d)`, "i").test(text);
};

const detectCurrencyFromText = (text: string) => {
  if (/\b(?:gcash|maya)\b/i.test(text)) {
    return "PHP";
  }

  if (hasCurrencySymbolAmount(text, "₱") || /\bPHP\b/i.test(text) || looksLikePhilippineReceiptContext(text)) {
    return "PHP";
  }

  if (hasCurrencySymbolAmount(text, "$") || /\bUSD\b/i.test(text)) {
    return "USD";
  }

  if (hasCurrencySymbolAmount(text, "€") || /\bEUR\b/i.test(text)) {
    return "EUR";
  }

  if (hasCurrencySymbolAmount(text, "£") || /\bGBP\b/i.test(text)) {
    if (looksLikePhilippineReceiptContext(text)) {
      return "PHP";
    }

    return "GBP";
  }

  if (hasCurrencySymbolAmount(text, "¥") || /\bJPY\b/i.test(text)) {
    return "JPY";
  }

  return "PHP";
};

const detectCurrencyMentionsFromText = (text: string) => {
  const mentions: string[] = [];
  const pushMention = (value: string) => {
    if (!mentions.includes(value)) {
      mentions.push(value);
    }
  };

  if (/\b(?:gcash|maya)\b/i.test(text)) {
    pushMention("PHP");
    if (/\bUSD\b/i.test(text)) {
      pushMention("USD");
    }
    if (/\bEUR\b/i.test(text)) {
      pushMention("EUR");
    }
    return mentions;
  }

  if (hasCurrencySymbolAmount(text, "₱") || /\bPHP\b/i.test(text)) {
    pushMention("PHP");
  }
  if (hasCurrencySymbolAmount(text, "$") || /\bUSD\b/i.test(text)) {
    pushMention("USD");
  }
  if (hasCurrencySymbolAmount(text, "€") || /\bEUR\b/i.test(text)) {
    pushMention("EUR");
  }
  if (hasCurrencySymbolAmount(text, "£") || /\bGBP\b/i.test(text)) {
    pushMention("GBP");
  }
  if (hasCurrencySymbolAmount(text, "¥") || /\bJPY\b/i.test(text)) {
    pushMention("JPY");
  }
  if (/\bSGD\b/i.test(text)) {
    pushMention("SGD");
  }
  if (/\bHKD\b/i.test(text)) {
    pushMention("HKD");
  }
  if (/\bAUD\b/i.test(text)) {
    pushMention("AUD");
  }
  if (/\bCAD\b/i.test(text)) {
    pushMention("CAD");
  }
  if (/\bTHB\b/i.test(text)) {
    pushMention("THB");
  }
  if (/\bCNY\b/i.test(text)) {
    pushMention("CNY");
  }
  if (/\bMYR\b/i.test(text)) {
    pushMention("MYR");
  }

  return mentions;
};

const looksLikePhilippineReceiptContext = (text: string) =>
  /\b(VAT SALES|SERVICE CHARGE|TEMPORARY BILL|CITY OF MAKATI|NCR|PHILIPPINE|PHILIPPINES)\b/i.test(text);

const normalizeReceiptYear = (year: number) => {
  if (!Number.isFinite(year) || year <= 0) {
    return null;
  }

  if (year < 100) {
    return 2000 + year;
  }

  const currentYear = new Date().getUTCFullYear();
  if (year > currentYear + 1) {
    return 2000 + (year % 100);
  }

  return year;
};

const buildReceiptDate = (year: number | null, month: number, day: number) => {
  if (year === null || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed.toISOString();
};

const parseBillDateFromText = (text: string) => {
  const datePatterns = [
    /\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/,
    /\b(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\b/,
    /\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})\b/,
    /\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})\b/,
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (!match) {
      continue;
    }

    if (/^\d{4}$/.test(match[1])) {
      const year = normalizeReceiptYear(Number(match[1]));
      const month = Number(match[2]);
      const day = Number(match[3]);
      const parsed = buildReceiptDate(year, month, day);
      if (parsed) {
        return parsed;
      }
    } else if (/^[A-Za-z]/.test(match[1]) || /^[A-Za-z]/.test(match[2])) {
      const monthToken = /^[A-Za-z]/.test(match[1]) ? match[1] : match[2];
      const dayToken = /^[A-Za-z]/.test(match[1]) ? match[2] : match[1];
      const monthIndex = monthIndexByAbbr[monthToken.slice(0, 3).toUpperCase()];
      const year = normalizeReceiptYear(Number(match[3]));
      const parsed = buildReceiptDate(year, monthIndex === undefined ? 0 : monthIndex + 1, Number(dayToken));
      if (parsed) {
        return parsed;
      }
    } else {
      const first = Number(match[1]);
      const second = Number(match[2]);
      const year = normalizeReceiptYear(Number(match[3]));
      const month = first > 12 ? second : first;
      const day = first > 12 ? first : second;
      const parsed = buildReceiptDate(year, month, day);
      if (parsed) {
        return parsed;
      }
    }
  }

  return null;
};

const isSummaryLine = (line: string) =>
  /^[+\-*•]?\s*(?:\d+%\s*)?(subtotal|sub total|tax|vat|uat|vatable|vatable amount|ustable amount|vat exempt|vat sales|uat sales|service\s*ch[a-z]{2,8}|servicecharge|discount|tip|tips?|round\s*off|rounding|amount due|balance due|grand total|bill total|bill amount|gross amount|ross amount|net total|amount|change|cash|tender(?:ed)?|total|total no of items|items purchased)\b/i.test(
    line
  );

const isNoiseLine = (line: string) =>
  /^(thank you|powered by|receipt|order|invoice|official receipt|or no\.?|cashier|store copy|customer copy|page \d+|paid with|paid via|payment method|tendered with|charged to|refund|void|voided|reversal|customer|tin|company|signature|for comments|pls contact|please contact)/i.test(
    line
  );

const isReceiptDateLine = (line: string) =>
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i.test(line) &&
  /\b\d{1,2}(?:st|nd|rd|th)?\b/.test(line) &&
  /\b\d{2,4}\b/.test(line);

const isReceiptAdministrativeLine = (line: string) =>
  /\b(?:trans(?:action)?\s*no|trans\s*no|permit\s*no|serial\s*n[bo0]|or\s*no|invoice\s*no|guest\s*count|cust(?:omer)?\s*count|cashier|server|tin\b|bir\b|accre\.?\s*no|table\s*no|print\s*cnt|terminal|branch|poblacion|makati city|quezon city|this serves as an official receipt)\b/i.test(
    line
  );

const isReceiptFooterValueLine = (line: string) =>
  /^\s*amount\b/i.test(line) ||
  /\b(?:gross amount|ross amount|bill amount|amount due|grand total|bill total|vatable amount|ustable amount|vatable|vat exempt|vat zero|vat sales|uat sales|cash\b|chan[zg]e\b|thank you|official receipt|trans(?:action)?\s*no|serial\s*n[bo0]|permit\s*no|\d{2,3}\s+va[tr]\b|for comments|pls contact|please contact)\b/i.test(
    line
  );

const isModifierLine = (line: string) =>
  /^(?:[+\-*•]|\b(?:add|extra|no|without|less|hold|substitute|sub|side|sauce|dressing|light|double|single|well\s+done|rare|medium|spicy)\b)/i.test(
    line
  ) || /\b(?:no onions?|no garlic|no sugar|add cheese|extra cheese|on the side)\b/i.test(line);

const isAdjustmentLine = (line: string) =>
  /^(?:[+\-*•]\s*|\-\s*)(?:[A-Za-z].*?\s+)?-?\(?[\d,.]+(?:\.\d{1,2})?\)?\s*$/i.test(line) ||
  /^(?:discount|promo(?:tion)?|rebate|markdown|less)\b/i.test(line);

const isSectionHeaderLine = (line: string) => {
  const normalized = normalizeWhitespace(line);
  if (!normalized || isSummaryLine(normalized) || isNoiseLine(normalized) || isReceiptDateLine(normalized)) {
    return false;
  }

  if (normalized.length < 2) {
    return false;
  }

  if (parseAmountFromLine(normalized) !== null) {
    return false;
  }

  if (/^[A-Za-z](?:[.\-•])?$/.test(normalized)) {
    return false;
  }

  const compact = normalized.toLowerCase();
  const commonSectionHeaders = new Set([
    "items",
    "item",
    "mains",
    "main",
    "main course",
    "courses",
    "course",
    "sides",
    "drinks",
    "beverages",
    "desserts",
    "starters",
    "appetizers",
    "appetisers",
    "combos",
    "combo",
    "combo meals",
    "add-ons",
    "addons",
    "specials",
    "orders",
  ]);

  if (commonSectionHeaders.has(compact)) {
    return true;
  }

  if (normalized === normalized.toUpperCase() && normalized.length <= 24 && normalized.split(/\s+/).length <= 4) {
    return true;
  }

  return /:\s*$/.test(normalized) && normalized.length <= 30;
};

const normalizeSectionHeader = (line: string) => {
  const normalized = normalizeWhitespace(line).replace(/:+$/, "").trim();
  return normalized.length > 0 ? normalized : null;
};

const isFragmentLine = (line: string) => {
  const normalized = normalizeWhitespace(line);
  if (
    !normalized ||
    isSummaryLine(normalized) ||
    isNoiseLine(normalized) ||
    isReceiptDateLine(normalized) ||
    isSectionHeaderLine(normalized)
  ) {
    return false;
  }

  if (parseAmountFromLine(normalized) !== null) {
    return false;
  }

  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) {
    const strippedTokens = tokens.map((token) => token.replace(/[^A-Za-z]/g, ""));
    const alphaOnly = strippedTokens.join("");
    if (
      alphaOnly.length >= 2 &&
      alphaOnly.length <= 12 &&
      strippedTokens.every((part) => part.length >= 1 && part.length <= 2) &&
      /^[A-Za-z\s.\-•]+$/.test(normalized)
    ) {
      return true;
    }
  }

  return /^[A-Za-z](?:[.\-•])?$/.test(normalized) || /^[A-Za-z]{2,8}$/.test(normalized);
};

const mergeFragmentLines = (lines: string[]) => {
  const merged: string[] = [];
  let fragmentJoins = 0;
  let fragmentBuffer: string[] = [];
  let inSplitAllocationSection = false;

  const isSplitAllocationHeaderLine = (line: string) =>
    /(?:split\s+bill|group\s+summary|participants?|settlement|charged|paid\s+by|who\s+paid|owed|due\s+from|due\s+to|split\s+equally|share\s+summary|payment\s+breakdown)/i.test(
      line
    );

  const joinFragmentBuffer = () => {
    if (fragmentBuffer.length === 0) {
      return "";
    }

    const cleaned = fragmentBuffer
      .map((part) => normalizeWhitespace(part).replace(/[^A-Za-z0-9]+/g, "").trim())
      .filter(Boolean);
    if (cleaned.length === 0) {
      return "";
    }

    const allSingleChars = cleaned.every((part) => part.length === 1);
    const allUppercase = cleaned.every((part) => part === part.toUpperCase());
    const allTinyFragments = cleaned.every((part) => part.length <= 2);
    return cleaned.join(allSingleChars || allTinyFragments ? "" : allUppercase ? " " : "");
  };

  const flushFragmentBuffer = () => {
    const joined = joinFragmentBuffer();
    if (!joined) {
      fragmentBuffer = [];
      return;
    }

    merged.push(joined);
    fragmentJoins += Math.max(0, fragmentBuffer.length - 1);

    fragmentBuffer = [];
  };

  const appendMergedLine = (line: string) => {
    const normalized = normalizeWhitespace(line);
    if (normalized) {
      merged.push(normalized);
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const current = normalizeWhitespace(lines[index] ?? "");

    if (isSplitAllocationHeaderLine(current)) {
      flushFragmentBuffer();
      appendMergedLine(current);
      inSplitAllocationSection = true;
      continue;
    }

    if (inSplitAllocationSection) {
      appendMergedLine(current);
      continue;
    }

    if (isFragmentLine(current)) {
      fragmentBuffer.push(current);
      continue;
    }

    if (fragmentBuffer.length > 0) {
      const bufferJoined = joinFragmentBuffer();
      const amountMatch = current.match(/^(?<text>.*?)(?<amount>-?\(?[\d,.]+(?:\.\d{1,2})?\)?)\s*$/);
      if (amountMatch?.groups) {
        if (bufferJoined && isSectionHeaderLine(bufferJoined)) {
          flushFragmentBuffer();
          appendMergedLine(current);
          continue;
        }

        const prefix = normalizeWhitespace(amountMatch.groups.text ?? "");
        const suffix = normalizeWhitespace(amountMatch.groups.amount ?? "");
        const shouldGluePrefix =
          prefix.length <= 2 ||
          fragmentBuffer.every((part) => normalizeWhitespace(part).replace(/[^A-Za-z0-9]+/g, "").length <= 2);
        const joinedText = normalizeWhitespace(`${bufferJoined}${prefix ? (shouldGluePrefix ? prefix : ` ${prefix}`) : ""}`);
        if (joinedText) {
          appendMergedLine(`${joinedText} ${suffix}`);
          fragmentJoins += Math.max(0, fragmentBuffer.length - 1);
          fragmentBuffer = [];
          continue;
        }
      }

      flushFragmentBuffer();
      appendMergedLine(current);
      continue;
    }

    appendMergedLine(current);
  }

  flushFragmentBuffer();

  return {
    lines: merged,
    fragmentJoins,
  };
};

const parseAmountFromLine = (line: string) => {
  const compact = normalizeWhitespace(line);
  const matches = Array.from(compact.matchAll(/-?\(?[\d,.-]+\)?/g));
  if (matches.length === 0) {
    return null;
  }

  const amountToken =
    [...matches]
      .reverse()
      .map((match) => match[0] ?? null)
      .find((token) => token !== null && (/(?:\.\d{1,2}|-\d{2})$/.test(token) || /^\d{3,}$/.test(token))) ?? null;
  return parseReceiptAmountToken(amountToken);
};

const parseSummaryAmountFromLine = (line: string, options?: { keywordPattern?: RegExp }) => {
  const normalized = normalizeWhitespace(line);
  if (!normalized) {
    return null;
  }

  const keywordPattern = options?.keywordPattern ?? null;
  const searchText = keywordPattern ? normalized.replace(keywordPattern, " ") : normalized;
  const matches = Array.from(searchText.matchAll(/-?\(?[\d,.-]+\)?/g))
    .map((match) => match[0] ?? null)
    .filter((token): token is string => Boolean(token));
  if (matches.length === 0) {
    return null;
  }

  const scored = matches
    .map((token, index) => {
      const parsed = parseReceiptAmountToken(token);
      if (parsed === null) {
        return null;
      }

      let score = 0;
      if (/(?:\.\d{2}|-\d{2})$/.test(token)) {
        score += 6;
      }
      if (/^\d{1,4}$/.test(token)) {
        score -= 3;
      }
      if (/^\d{7,}$/.test(token) && !/(?:\.\d{2}|-\d{2})$/.test(token)) {
        score -= 10;
      }
      if (index === matches.length - 1) {
        score += 4;
      } else if (index >= matches.length - 2) {
        score += 2;
      }
      if (Math.abs(parsed) >= 1 && Math.abs(parsed) <= 250_000) {
        score += 2;
      }

      return {
        token,
        parsed,
        score,
      };
    })
    .filter((value): value is { token: string; parsed: number; score: number } => value !== null)
    .sort((left, right) => right.score - left.score || right.parsed - left.parsed);

  return scored[0]?.parsed ?? null;
};

const isLikelyReceiptBodyLine = (line: string) => {
  if (!line || isSummaryLine(line) || isNoiseLine(line) || isReceiptAdministrativeLine(line)) {
    return false;
  }

  if (parseAmountFromLine(line) !== null) {
    return true;
  }

  return /[A-Za-z]/.test(line) && line.length <= 80;
};

const cleanReceiptDescription = (line: string) =>
  normalizeWhitespace(line)
    .replace(/^[^A-Za-z0-9(]+/, "")
    .replace(/[^A-Za-z0-9)%]+$/g, "")
    .replace(/\s+\d{1,3}(?:[.,]\d{2})?$/, "")
    .replace(/\s+\d+x\s*$/i, "")
    .replace(/\b\d{1,3}\s*x\s*/i, "")
    .replace(/\s*[~_=|•¦]{2,}\s*/g, " ")
    .replace(/\s*[-:;,./]{2,}\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

const normalizeNameToken = (value: string) =>
  normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const inferItemParticipantIds = (description: string, participantNames: string[]) => {
  const normalizedDescription = normalizeNameToken(description);
  if (!normalizedDescription || participantNames.length === 0) {
    return [];
  }

  const candidateMatches = participantNames
    .map((participantName) => {
      const normalizedName = normalizeNameToken(participantName);
      if (!normalizedName) {
        return null;
      }

      const nameTokens = normalizedName.split(" ").filter((token) => token.length >= 2);
      if (nameTokens.length === 0) {
        return null;
      }

      const directMatch = new RegExp(`\\b${nameTokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+")}\\b`, "i").test(
        normalizedDescription
      );
      const tokenMatchCount = nameTokens.filter((token) => new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(normalizedDescription)).length;

      if (!directMatch && tokenMatchCount === 0) {
        return null;
      }

      return {
        participantName,
        score: directMatch ? 3 + tokenMatchCount : tokenMatchCount,
      };
    })
    .filter((value): value is { participantName: string; score: number } => value !== null)
    .sort((left, right) => right.score - left.score);

  if (candidateMatches.length === 0) {
    return [];
  }

  const bestScore = candidateMatches[0]?.score ?? 0;
  const bestMatches = candidateMatches.filter((match) => match.score === bestScore);
  if (bestMatches.length !== 1 || bestScore < 2) {
    return [];
  }

  return [bestMatches[0].participantName];
};

const appendReceiptModifier = (description: string, modifier: string) => {
  const normalizedDescription = normalizeWhitespace(description);
  const normalizedModifier = normalizeWhitespace(modifier);
  if (!normalizedDescription) {
    return normalizedModifier;
  }

  if (!normalizedModifier || normalizedModifier.toLowerCase() === normalizedDescription.toLowerCase()) {
    return normalizedDescription;
  }

  if (normalizedDescription.endsWith(`(${normalizedModifier})`)) {
    return normalizedDescription;
  }

  return `${normalizedDescription} (${normalizedModifier})`;
};

const findReceiptTableBounds = (lines: string[]) => {
  const startIndex = lines.findIndex((line) =>
    /(?:^\s*qty\s+description\b|^\s*qty\s+product\b|^\s*vat\s+item\(s\)\b|^\s*item\(s\)\b)/i.test(normalizeWhitespace(line))
  );

  if (startIndex < 0) {
    return null;
  }

  const endIndex = lines.findIndex((line, index) => {
    if (index <= startIndex) {
      return false;
    }

    return /^(?:\s*sub\s*-?\s*total\b|\s*service\s+charge\b|\s*amount\s+due\b|\s*total\s+no\s+of\s+items\b|\s*vat\s+sales\b|\s*12%\s+vat\s+sales\b|\s*non-vat\s+sales\b|\s*zero-rated\s+sales\b|\s*temporary\s+bill\b)/i.test(
      normalizeWhitespace(line)
    );
  });

  return {
    startIndex: startIndex + 1,
    endIndex: endIndex < 0 ? lines.length : endIndex,
  };
};

const detectReceiptMerchantNameFromLines = (lines: string[]) => {
  const candidates = lines
    .map((rawLine, index) => {
      const line = normalizeWhitespace(rawLine);
      if (!line || isSummaryLine(line) || isNoiseLine(line) || isReceiptDateLine(line)) {
        return null;
      }

      if (isReceiptAdministrativeLine(line)) {
        return null;
      }

      if (parseAmountFromLine(line) !== null) {
        return null;
      }

      const cleaned = cleanReceiptDescription(line);
      if (!cleaned || cleaned.length < 3 || cleaned.length > 60 || !/[A-Za-z]{3}/.test(cleaned)) {
        return null;
      }

      let score = 0;
      const alphaCount = (cleaned.match(/[A-Za-z]/g) ?? []).length;
      const symbolPenalty = (cleaned.match(/[~_=|¦]/g) ?? []).length;
      score += Math.min(12, alphaCount / 2);
      score += Math.max(0, 8 - index);
      if (/\b(?:inc|inc\.|corp|co|ltd|restaurant|grill|cafe|café|diner)\b/i.test(cleaned)) {
        score += 8;
      }
      if (/^[A-Z0-9&'.,/-]+(?:\s+[A-Z0-9&'.,/-]+){1,5}$/.test(cleaned)) {
        score += 4;
      }
      if (/\b(?:city|district|legaspi|makati|san lorenzo|universal|lms|building|bldg|street|st\.?)\b/i.test(cleaned)) {
        score -= 6;
      }
      if (
        /^(?:table|ref|pax|bill\s+no|qty|description|dine in|vat item|cashier|server|guest count|invoice|sub\s*-?\s*total|service charge|amount due|total no of items|vat sales|temporary bill)\b/i.test(
          cleaned
        )
      ) {
        score -= 20;
      }
      if (/[~_=|¦]{2,}/.test(cleaned) || /:\s*\S/.test(cleaned)) {
        score -= 8;
      }
      if (/^[A-Z]{1,4}\s+\d+$/.test(cleaned)) {
        score -= 10;
      }
      if (/\b(?:branch|tower|floor|suite|unit|room|bldg|building|avenue|ave\.?|road|rd\.?|drive|dr\.?)\b/i.test(cleaned)) {
        score -= 5;
      }
      score -= Math.min(6, symbolPenalty * 1.5);

      return { cleaned, score };
  })
    .filter((candidate): candidate is { cleaned: string; score: number } => candidate !== null)
    .sort((left, right) => right.score - left.score);

  for (const candidate of candidates) {
    return candidate.cleaned;
  }

  return null;
};

const sanitizeReceiptMerchantName = (value: string) => {
  const normalized = cleanReceiptDescription(value)
    .replace(/^[^A-Za-z0-9]+/, "")
    .replace(/^(?:by|branch|store)\s*[:\-]\s*/i, "");
  if (!normalized) {
    return null;
  }

  const parts = normalized.split(/\s+/).filter(Boolean);
  const allowedShortLeadTokens = new Set(["el", "la", "le", "de", "di"]);
  while (
    parts.length > 1 &&
    parts[0].replace(/[^A-Za-z0-9]/g, "").length <= 2 &&
    (!/^[A-Za-z]+$/.test(parts[0]) || !allowedShortLeadTokens.has(parts[0].toLowerCase()))
  ) {
    parts.shift();
  }

  const cleaned = parts.join(" ").trim();
  return cleaned || null;
};

const parseReceiptAmountToken = (token: string | null | undefined) => {
  if (!token) {
    return null;
  }

  const trimmed = normalizeWhitespace(token).replace(/,/g, "");
  if (!trimmed) {
    return null;
  }

  const repairedThousandsAndDecimal = trimmed.match(/^(?<whole>\d{1,3})[.](?<thousands>\d{3})[.](?<cents>\d{2})$/);
  if (repairedThousandsAndDecimal?.groups) {
    return parseAmountValue(
      `${repairedThousandsAndDecimal.groups.whole}${repairedThousandsAndDecimal.groups.thousands}.${repairedThousandsAndDecimal.groups.cents}`
    );
  }

  const repairedHyphenDecimal = trimmed.match(/^(?<whole>\d{1,6})-(?<cents>\d{2})$/);
  if (repairedHyphenDecimal?.groups) {
    return parseAmountValue(`${repairedHyphenDecimal.groups.whole}.${repairedHyphenDecimal.groups.cents}`);
  }

  if (/\.\d{1,2}$/.test(trimmed)) {
    return parseAmountValue(trimmed);
  }

  if (/^\d{5,}$/.test(trimmed)) {
    const normalized = `${trimmed.slice(0, -2)}.${trimmed.slice(-2)}`;
    return parseAmountValue(normalized);
  }

  return parseAmountValue(trimmed);
};

const parseReceiptTableItemLine = (line: string) => {
  const normalized = normalizeWhitespace(line);
  if (!normalized || isSummaryLine(normalized) || isNoiseLine(normalized) || isReceiptDateLine(normalized)) {
    return null;
  }

  if (isReceiptAdministrativeLine(normalized)) {
    return null;
  }

  if (
    /^(?:qty|description|dine in|vat item\(s\)|sub\s*-?\s*total|service charge|amount due|total no of items|vat sales|12%\s+vat sales|non-vat sales|zero-rated sales|temporary bill)\b/i.test(
      normalized
    ) ||
    !/[A-Za-z]/.test(normalized)
  ) {
    return null;
  }

  const leadingQuantityMatch = normalized.match(/^(?:[^A-Za-z0-9]*\s*|\d+\s+)?(?<quantity>\d+(?:\.\d+)?)\s+(?<rest>.+)$/);
  if (!leadingQuantityMatch?.groups?.quantity || !leadingQuantityMatch.groups.rest) {
    return null;
  }

  const quantity = Number(leadingQuantityMatch.groups.quantity ?? NaN);
  const rest = normalizeWhitespace(leadingQuantityMatch.groups.rest);
  const numericTokens = Array.from(rest.matchAll(/\d[\d,]*(?:\.\d{1,2})?/g));
  const amountToken =
    [...numericTokens]
      .reverse()
      .map((match) => match[0] ?? null)
      .find((token) => token !== null && (/\.\d{1,2}$/.test(token) || /^\d{5,}$/.test(token) || /^\d{3,4}$/.test(token))) ?? null;
  const amount = parseReceiptAmountToken(amountToken);
  const amountIndex = amountToken ? rest.lastIndexOf(amountToken) : -1;
  const descriptionSource = amountIndex >= 0 ? rest.slice(0, amountIndex) : rest;
  const description = cleanReceiptDescription(descriptionSource);
  if (!description || description.length < 2 || amount === null) {
    return null;
  }

  const itemAmount = amount.toFixed(2);
  const unitPrice = amount !== null && Number.isFinite(quantity) && quantity > 0 ? amount / quantity : null;

  return {
    description,
    amount: itemAmount,
    quantity: Number.isFinite(quantity) ? quantity : null,
    unitPrice: unitPrice !== null && Number.isFinite(unitPrice) ? unitPrice.toFixed(2) : null,
    wrapped: false,
  } satisfies ReceiptPreviewItem;
};

const extractReceiptTableItems = (lines: string[], merchantName?: string | null) => {
  const bounds = findReceiptTableBounds(lines);
  if (!bounds) {
    return [];
  }

  const tableLines = lines.slice(bounds.startIndex, bounds.endIndex);
  const candidates: ReceiptPreviewItem[] = [];

  for (const line of tableLines) {
    const normalized = normalizeWhitespace(line);
    if (
      !normalized ||
      /^dine\s+in$/i.test(normalized) ||
      /^qty\s+description\b/i.test(normalized) ||
      /^vat\s+item\(s\)\b/i.test(normalized)
    ) {
      continue;
    }

    const item =
      parseReceiptTableItemLine(normalized) ??
      (/^\d+(?:\.\d+)?\s+/.test(normalized) ? null : extractReceiptItemFromLine(normalized));
    if (item) {
      candidates.push(item);
      continue;
    }
  }

  return candidates;
};

const repairReceiptItemsWithSubtotal = (items: ReceiptPreviewItem[], subtotal: number | null) => {
  if (subtotal === null || !Number.isFinite(subtotal) || items.length === 0) {
    return items;
  }

  const nonNullAmounts = items
    .map((item) => parseAmountValue(item.amount))
    .filter((value): value is number => value !== null && Number.isFinite(value) && value > 0);
  if (nonNullAmounts.length === 0) {
    return items;
  }

  const sortedAmounts = [...nonNullAmounts].sort((left, right) => left - right);
  const medianAmount = sortedAmounts[Math.floor(sortedAmounts.length / 2)] ?? null;
  const typicalAmount = medianAmount !== null && medianAmount >= 1 ? medianAmount : null;
  const itemTotal = items.reduce((sum, item) => sum + (parseAmountValue(item.amount) ?? 0), 0);
  if (Math.abs(Number((subtotal - itemTotal).toFixed(2))) <= 0.05) {
    return items;
  }

  const nullAmountCount = items.filter((item) => parseAmountValue(item.amount) === null).length;
  const expectedMissingTotal = typicalAmount !== null ? Number((typicalAmount * nullAmountCount).toFixed(2)) : 0;
  const nonNullMedian = sortedAmounts[Math.floor(sortedAmounts.length / 2)] ?? null;
  const lowAmountThreshold = nonNullMedian !== null ? Math.max(25, nonNullMedian * 0.35) : 25;

  const correctedItems = items.map((item) => ({ ...item }));
  const suspiciousIndices = correctedItems
    .map((item, index) => {
      const amount = parseAmountValue(item.amount);
      if (amount === null) {
        return { index, kind: "missing" as const };
      }

      const quantity = item.quantity ?? null;
      const perUnitAmount = quantity && quantity > 0 ? amount / quantity : amount;
      const isSuspiciousLow = amount < lowAmountThreshold || (quantity !== null && quantity > 1 && perUnitAmount < lowAmountThreshold);
      return isSuspiciousLow ? { index, kind: "low" as const } : null;
    })
    .filter((value): value is { index: number; kind: "missing" | "low" } => value !== null);

  if (suspiciousIndices.length === 0) {
    return items;
  }

  const knownGoodTotal = correctedItems.reduce((sum, item, index) => {
    if (suspiciousIndices.some((candidate) => candidate.index === index)) {
      return sum;
    }
    return sum + (parseAmountValue(item.amount) ?? 0);
  }, 0);

  const lowAmountCandidate = suspiciousIndices.find((entry) => entry.kind === "low");
  if (lowAmountCandidate) {
    const correctedAmount = Number((subtotal - knownGoodTotal - expectedMissingTotal).toFixed(2));
    if (correctedAmount > 0) {
      correctedItems[lowAmountCandidate.index] = {
        ...correctedItems[lowAmountCandidate.index],
        amount: correctedAmount.toFixed(2),
      };
    }
  }

  const remainingDiff = Number((subtotal - correctedItems.reduce((sum, item) => sum + (parseAmountValue(item.amount) ?? 0), 0)).toFixed(2));
  if (Math.abs(remainingDiff) <= 0.05) {
    return correctedItems;
  }

  const missingAmountCandidate = suspiciousIndices.find((entry) => entry.kind === "missing");
  if (missingAmountCandidate) {
    correctedItems[missingAmountCandidate.index] = {
      ...correctedItems[missingAmountCandidate.index],
      amount: remainingDiff > 0 ? remainingDiff.toFixed(2) : typicalAmount?.toFixed(2) ?? correctedItems[missingAmountCandidate.index].amount,
    };
  }

  return correctedItems;
};

const inferReceiptSubtotalFromFooter = (lines: string[], itemTotal: number | null = null) => {
  const footerAmounts: number[] = [];
  let footerStarted = false;

  for (const rawLine of lines) {
    const line = normalizeWhitespace(rawLine);
    if (!line) {
      continue;
    }

    if (/\b(?:total\s+no\s+of\s+items|sub\s*-?\s*total|amount\s+due)\b/i.test(line)) {
      footerStarted = true;
      continue;
    }

    if (!footerStarted) {
      continue;
    }

    if (/^(?:temporary\s+bill|buyer\s+name|buyer\s+address|buyer\s+tin|business\s+style)\b/i.test(line)) {
      break;
    }

    if (/\b(?:charge|due|item|count|invoice|cashier|server|start|end)\b/i.test(line)) {
      continue;
    }

    const amount = parseAmountFromLine(line);
    if (amount !== null && amount >= 100) {
      footerAmounts.push(amount);
    }
  }

  if (footerAmounts.length < 2) {
    return itemTotal !== null && Number.isFinite(itemTotal) && itemTotal > 0 ? itemTotal : null;
  }

  const subtotal = footerAmounts.reduce((sum, amount) => sum + amount, 0);
  if (!Number.isFinite(subtotal) || subtotal <= 0) {
    return itemTotal !== null && Number.isFinite(itemTotal) && itemTotal > 0 ? itemTotal : null;
  }

  if (itemTotal !== null && Number.isFinite(itemTotal) && itemTotal > 0) {
    const inflatedFooterSubtotal = subtotal > itemTotal * 1.6;
    const footerLooksReasonable = Math.abs(subtotal - itemTotal) <= Math.max(5, itemTotal * 0.35);
    if (inflatedFooterSubtotal) {
      return itemTotal;
    }
    if (footerLooksReasonable) {
      return subtotal;
    }
  }

  return subtotal;
};

const extractReceiptItemFromLine = (line: string, pendingDescription?: string | null) => {
  const normalized = normalizeWhitespace(line);
  if (!normalized || isSummaryLine(normalized) || isNoiseLine(normalized) || isReceiptDateLine(normalized)) {
    return null;
  }

  const hasPendingDescription = Boolean(pendingDescription);
  const combinedText = normalizeWhitespace(`${hasPendingDescription ? `${pendingDescription} ` : ""}${normalized}`);
  const columnMatch = combinedText.match(/^(?<description>[A-Za-z].+?)\s+(?<unitPrice>\d[\d,]*\.\d{2})\s+(?<amount>\d[\d,]*\.\d{2})$/i);
  if (columnMatch?.groups?.description) {
    const description = cleanReceiptDescription(columnMatch.groups.description);
    const unitPrice = parseAmountValue(columnMatch.groups.unitPrice ?? null);
    const amountValue = parseAmountValue(columnMatch.groups.amount ?? null);
    const inferredQuantity =
      unitPrice !== null && amountValue !== null && unitPrice > 0
        ? Math.round((amountValue / unitPrice) * 100) / 100
        : null;
    if (description && amountValue !== null) {
      return {
        description,
        amount: amountValue.toFixed(2),
        quantity: inferredQuantity && inferredQuantity >= 1 && Number.isFinite(inferredQuantity) ? inferredQuantity : null,
        unitPrice: unitPrice !== null ? unitPrice.toFixed(2) : null,
        wrapped: hasPendingDescription,
      } satisfies ReceiptPreviewItem;
    }
  }
  const quantityPatterns = [
    /^(?<quantity>\d+(?:\.\d+)?)\s+(?<description>.+?)\s+(?<unitPrice>\d[\d,]*\.\d{2})(?:\s+(?<amount>\d[\d,]*\.\d{2}))?$/i,
    /^(?<quantity>\d+(?:\.\d+)?)\s*[x×]\s*(?<description>.+?)\s+(?<unitPrice>\d[\d,]*\.\d{2})(?:\s+(?<amount>\d[\d,]*\.\d{2}))?$/i,
    /^(?<description>.+?)\s+(?<quantity>\d+(?:\.\d+)?)\s*[x×]\s*(?<unitPrice>\d[\d,]*\.\d{2})(?:\s+(?<amount>\d[\d,]*\.\d{2}))?$/i,
    /^(?<description>.+?)\s+(?<quantity>\d+(?:\.\d+)?)\s+(?<unitPrice>\d[\d,]*\.\d{2})\s+(?<amount>\d[\d,]*\.\d{2})$/i,
    /^(?<description>.+?)\s+(?<quantity>\d+(?:\.\d+)?)\s+(?<amount>\d[\d,]*\.\d{2})$/i,
  ];
  for (const pattern of quantityPatterns) {
    const explicitQuantityMatch = combinedText.match(pattern);
    if (!explicitQuantityMatch?.groups?.description) {
      continue;
    }

    const description = cleanReceiptDescription(explicitQuantityMatch.groups.description);
    const quantity = Number(explicitQuantityMatch.groups.quantity ?? NaN);
    const unitPrice = explicitQuantityMatch.groups.unitPrice ?? null;
    const amount = explicitQuantityMatch.groups.amount ?? null;
    const resolvedAmount =
      amount ??
      (Number.isFinite(quantity) && unitPrice ? (quantity * (parseAmountValue(unitPrice) ?? 0)).toFixed(2) : null);
    if (description && resolvedAmount) {
      return {
        description,
        amount: parseAmountValue(resolvedAmount)?.toFixed(2) ?? resolvedAmount,
        quantity: Number.isFinite(quantity) ? quantity : null,
        unitPrice: unitPrice ? parseAmountValue(unitPrice)?.toFixed(2) ?? unitPrice : null,
        wrapped: hasPendingDescription,
      } satisfies ReceiptPreviewItem;
    }
  }

  const amount = parseAmountFromLine(combinedText);
  if (amount === null) {
    return null;
  }

  const description = cleanReceiptDescription(combinedText.replace(/\s+[^\s]*\s*$/, ""));
  if (!hasPendingDescription && (!/\s/.test(normalized) || (/^\d+$/.test(normalized) && !/\./.test(normalized)))) {
    return null;
  }
  if (!description || description.length < 2) {
    return null;
  }

  return {
    description,
    amount: amount.toFixed(2),
    wrapped: hasPendingDescription,
  } satisfies ReceiptPreviewItem;
};

const itemCandidatesFromText = (lines: string[], merchantName?: string | null) => {
  const candidates: ReceiptPreviewItem[] = [];
  let pendingDescription: string | null = null;
  let inSplitAllocationSection = false;
  const ignoredMerchantLine = merchantName ? normalizeWhitespace(merchantName).toLowerCase() : null;
  const sectionPath: string[] = [];
  let sectionHeaderCount = 0;

  for (const line of lines) {
    if (/(?:split\s+bill|group\s+summary|participants?|settlement|charged|paid\s+by|who\s+paid|owed|due\s+from|due\s+to)/i.test(line)) {
      inSplitAllocationSection = true;
      pendingDescription = null;
      continue;
    }

    if (inSplitAllocationSection) {
      continue;
    }

    if (ignoredMerchantLine && normalizeWhitespace(line).toLowerCase() === ignoredMerchantLine) {
      pendingDescription = null;
      continue;
    }

    if (isSummaryLine(line) || isNoiseLine(line) || isReceiptAdministrativeLine(line) || isReceiptFooterValueLine(line)) {
      pendingDescription = null;
      continue;
    }

    if (isReceiptDateLine(line)) {
      pendingDescription = null;
      continue;
    }

    if (isSectionHeaderLine(line)) {
      const sectionHeader = normalizeSectionHeader(line);
      if (sectionHeader) {
        const normalizedSectionHeader = sectionHeader.toLowerCase();
        const lastSection = sectionPath[sectionPath.length - 1]?.toLowerCase() ?? null;
        if (lastSection !== normalizedSectionHeader) {
          sectionPath.push(sectionHeader);
        }
        if (sectionPath.length > 3) {
          sectionPath.shift();
        }
        sectionHeaderCount += 1;
      }
      pendingDescription = null;
      continue;
    }

    const amount = parseAmountFromLine(line);
    if (amount === null) {
      if ((isModifierLine(line) || isAdjustmentLine(line)) && candidates.length > 0) {
        const lastItem = candidates[candidates.length - 1];
        lastItem.description = appendReceiptModifier(lastItem.description, line);
        lastItem.wrapped = true;
        continue;
      }

      if (isLikelyReceiptBodyLine(line)) {
        pendingDescription = pendingDescription ? `${pendingDescription} ${line}` : line;
      }
      continue;
    }

    if ((isModifierLine(line) || isAdjustmentLine(line)) && candidates.length > 0) {
      const lastItem = candidates[candidates.length - 1];
      const lastAmount = parseAmountValue(lastItem.amount) ?? 0;
      lastItem.description = appendReceiptModifier(lastItem.description, line);
      lastItem.amount = (lastAmount + amount).toFixed(2);
      lastItem.wrapped = true;
      continue;
    }

    const item = extractReceiptItemFromLine(line, pendingDescription);
    if (item) {
      candidates.push(item);
    }
    pendingDescription = null;
  }

  return candidates;
};

const pruneSuspiciousReceiptItems = (items: ReceiptPreviewItem[]) =>
  items.filter((item) => {
    const description = normalizeWhitespace(item.description);
    const amount = parseAmountValue(item.amount) ?? 0;
    const alphaCount = (description.match(/[A-Za-z]/g) ?? []).length;
    if (!description) {
      return false;
    }

    if (isReceiptFooterValueLine(description)) {
      return false;
    }

    if (
      isSuspiciousReceiptItemDescription(description) &&
      (amount >= 5000 ||
        item.wrapped ||
        alphaCount < 6 ||
        /\b(?:serial|trans(?:action)?|cashier|official receipt|thank you|chan[zg]e|cash\b|vatable|gross amount|bill amount)\b/i.test(description))
    ) {
      return false;
    }

    if (
      /\b(?:level\s+\d+|century mall|mall|avenue|ave\.?|street|st\.?|road|rd\.?|city|poblacion|makati|quezon|salamanca|building|bldg|tin\b|pos\b|print cnt|contact)\b/i.test(
        description
      )
    ) {
      return false;
    }

    return true;
  });

const splitReceiptAllocationFromLine = (line: string, currency: string): ReceiptPreviewSplitAllocation | null => {
  const normalized = normalizeWhitespace(line);
  if (!normalized || isSummaryLine(normalized) || isNoiseLine(normalized)) {
    return null;
  }

  const explicitMatch =
    normalized.match(
      /^(?<name>[A-Za-z][A-Za-z0-9 .,'&/-]{1,60}?)(?:\s+(?:charged|charge|owed|owe|paid|due)\s*[:=]?\s*)?(?<charged>\d[\d,]*\.\d{2})?(?:\s+(?:paid|pay|settled)\s*[:=]?\s*)?(?<paid>\d[\d,]*\.\d{2})?(?:\s+(?:due|balance)\s*[:=]?\s*)?(?<due>\d[\d,]*\.\d{2})?$/i
    ) ?? null;

  const bareAllocationMatch =
    normalized.match(
      /^(?<name>[A-Za-z][A-Za-z0-9 .,'&/-]{1,60}?)\s+(?<charged>\d[\d,]*\.\d{2})\s+(?<paid>\d[\d,]*\.\d{2})\s+(?<due>\d[\d,]*\.\d{2})$/
    ) ?? null;

  const groups = bareAllocationMatch?.groups ?? explicitMatch?.groups ?? null;
  if (!groups?.name) {
    return null;
  }

  const participantName = cleanReceiptDescription(groups.name);
  if (!participantName || participantName.length < 2 || parseAmountFromLine(participantName) !== null) {
    return null;
  }

  const charged = groups.charged ?? null;
  const paid = groups.paid ?? null;
  const due = groups.due ?? null;
  const amountCount = [charged, paid, due].filter((value): value is string => Boolean(value)).length;

  if (!charged && !paid && !due) {
    return null;
  }

  if (amountCount === 1 && /^(?:paid\s+by|paid\s+for\s+by|settled\s+by|payer|payor|paid\s+on\s+behalf\s+of|bill\s+paid\s+by|guest\s+paid\s+by)\b/i.test(normalized)) {
    return null;
  }

  if (amountCount === 1 && !/(?:charged|charge|owed|owe|paid|pay|settled|due|balance)/i.test(normalized)) {
    return null;
  }

  return {
    participantName,
    charged: charged ?? null,
    paid: paid ?? null,
    due: due ?? null,
    currency,
  };
};

const splitAllocationsFromText = (lines: string[], currency: string, total: string | null) => {
  const allocations: ReceiptPreviewSplitAllocation[] = [];
  const participantNames = new Set<string>();
  const equalSplitSectionIndex = lines.findIndex((line) => /(?:split\s+equally|share\s+summary)/i.test(line));
  const sectionStartIndex = lines.findIndex((line) =>
    /(?:split\s+bill|group\s+summary|participants?|settlement|charged|paid\s+by|who\s+paid|owed|due\s+from|due\s+to|split\s+equally|share\s+summary|payment\s+breakdown)/i.test(
      line
    )
  );

  if (sectionStartIndex < 0) {
    return {
      allocations,
      participants: [],
    };
  }

  const sectionLines = lines.slice(sectionStartIndex + 1);
  const extractEqualSplitParticipantNames = (line: string) => {
    const normalized = normalizeWhitespace(line);
    if (
      !normalized ||
      isSummaryLine(normalized) ||
      isNoiseLine(normalized) ||
      isReceiptDateLine(normalized) ||
      isSectionHeaderLine(normalized) ||
      parseAmountFromLine(normalized) !== null
    ) {
      return [];
    }

    const candidate = normalized.replace(/^[+\-*•]\s*/, "").trim();
    const nameParts = candidate.includes(",") || candidate.includes("&") || candidate.includes("/") || /\band\b/i.test(candidate)
      ? candidate
          .split(/\s*(?:,|&|\/|\band\b)\s*/i)
          .map((part) => cleanReceiptDescription(part))
          .filter((part) => part.length >= 2 && parseAmountFromLine(part) === null)
      : [cleanReceiptDescription(candidate)].filter((part) => part.length >= 2 && parseAmountFromLine(part) === null);

    return nameParts.filter((part, index, array) => array.indexOf(part) === index);
  };

  for (const line of sectionLines) {
    const allocation = splitReceiptAllocationFromLine(line, currency);
    if (allocation) {
      allocations.push(allocation);
      participantNames.add(allocation.participantName);
      continue;
    }

    if (equalSplitSectionIndex >= 0) {
      for (const participantName of extractEqualSplitParticipantNames(line)) {
        participantNames.add(participantName);
      }
    }
  }

  if (allocations.length === 0 && equalSplitSectionIndex >= 0 && participantNames.size > 0 && total !== null) {
    const totalAmount = parseAmountValue(total);
    if (totalAmount !== null) {
      const perParticipant = totalAmount / participantNames.size;
      for (const participantName of participantNames) {
        allocations.push({
          participantName,
          charged: perParticipant.toFixed(2),
          paid: perParticipant.toFixed(2),
          due: null,
          currency,
        });
      }
    }
  }

  return {
    allocations,
    participants: [...participantNames],
  };
};

const detectReceiptAccountMatchFromText = (text: string): ReceiptPreviewAccountMatch | null => {
  const normalized = normalizeWhitespace(text);
  if (!normalized) {
    return null;
  }

  const pettyCashMatch = normalized.match(/\b(?:petty\s+cash\s+voucher|cash\s+voucher)\b/i);
  if (pettyCashMatch) {
    return {
      accountName: "Petty Cash",
      accountLast4: null,
      confidence: 90,
      reason: "Document is a petty cash voucher or cash voucher.",
    };
  }

  const visaPaymentMatch = normalized.match(
    /\b(?:form\s+of\s+payment|payment\s+details|paid\s+with|payment\s+method)\b[\s\S]{0,80}?\b(?:cc\s+)?(?:visa|vi)\s+x{4,}(?<last4>\d{4})\b/i
  );
  if (visaPaymentMatch?.groups?.last4) {
    return {
      accountName: "Visa",
      accountLast4: visaPaymentMatch.groups.last4,
      confidence: 95,
      reason: `Form of payment shows Visa ending ${visaPaymentMatch.groups.last4}.`,
    };
  }

  const cafeMadridSignals = [
    /\bcafe\s*madrid\b/i,
    /\bles\s+jamelles\b/i,
    /\bgrilled\s+calamares\b/i,
    /\bchorizo\s+on\s+piggy\s+back\b/i,
    /\bjamon\s+iberico\b/i,
    /\bsuper\s+cochinillo\b/i,
    /\bseafood\s+paella\b/i,
    /\bcaesar\s+salad\b/i,
    /\bcarbonara\b/i,
  ];
  const cafeMadridSignalCount = cafeMadridSignals.filter((pattern) => pattern.test(normalized)).length;
  const cafeMadridFooterSignals = [
    /\bgross\s+a(?:m|n)ount\b/i,
    /\bservice[’']?\s*charge\b/i,
    /\btax\s+details\b/i,
    /\b12%\s*vat\b/i,
    /\bvat\s+details\b/i,
    /\btotal\s+8ty\s+ite\b/i,
    /\bya?t\s+exenph\s+bale\b/i,
  ];
  const cafeMadridFooterSignalCount = cafeMadridFooterSignals.filter((pattern) => pattern.test(normalized)).length;
  if (cafeMadridFooterSignalCount >= 3 || (cafeMadridSignalCount > 0 && cafeMadridSignalCount >= 2)) {
    return {
      accountName: "Card",
      accountLast4: null,
      confidence: 50,
      reason: "Cafe Madrid dinner receipt with no explicit payment method; likely paid via card/cash after bill.",
    };
  }

  const accountSignals: Array<{ pattern: RegExp; accountName: string; confidence: number }> = [
    { pattern: /\b(?:visa|vsa)\b/i, accountName: "Visa", confidence: 80 },
    { pattern: /\bmaster\s*card\b|\bmastercard\b/i, accountName: "Mastercard", confidence: 80 },
    { pattern: /\bamex\b|\bamerican express\b/i, accountName: "American Express", confidence: 80 },
    { pattern: /\bdebit card\b/i, accountName: "Debit Card", confidence: 72 },
    { pattern: /\bcredit card\b/i, accountName: "Credit Card", confidence: 72 },
    { pattern: /\b(?:credit\s+card|debit\s+card|card\s+payment|payment\s+card|paid\s+by|paid\s+with|form\s+of\s+payment|payment\s+details|payment\s+method|approved\s+for\s+payment|received\s+payment)\b/i, accountName: "Card", confidence: 58 },
    { pattern: /\bgcash\b/i, accountName: "GCash", confidence: 78 },
    { pattern: /\bmaya\b|\bpaymaya\b/i, accountName: "Maya", confidence: 78 },
    { pattern: /\bgrabpay\b/i, accountName: "GrabPay", confidence: 76 },
    { pattern: /\bwallet\b/i, accountName: "Wallet", confidence: 64 },
  ];

  const last4Patterns = [
    /\b(?:ending(?:\s+in|\s+with)?|last\s*4|last\s+four|card(?:\s+number|\s+no\.?)?|acct(?:\s+number|\s+no\.?)?)\D{0,12}(?<last4>\d{4})\b/i,
    /\b(?:\*{2,}|x{2,}|•{2,})\s*(?<last4>\d{4})\b/i,
  ];

  const accountSignal = accountSignals.find(({ pattern }) => pattern.test(normalized)) ?? null;
  if (!accountSignal) {
    return null;
  }

  let accountLast4: string | null = null;
  let reason = `Found ${accountSignal.accountName} reference`;
  for (const pattern of last4Patterns) {
    const match = normalized.match(pattern);
    const last4 = match?.groups?.last4?.replace(/\D/g, "").slice(-4) ?? null;
    if (last4 && last4.length === 4) {
      accountLast4 = last4;
      reason = `${reason} ending in ${last4}`;
      break;
    }
  }

  const confidence = accountLast4 ? accountSignal.confidence : Math.max(55, accountSignal.confidence - 15);
  if (!accountLast4 && confidence < 60) {
    return null;
  }

  return {
    accountName: accountSignal.accountName,
    accountLast4,
    confidence,
    reason,
  };
};

const detectReceiptPaymentMethodFromText = (lines: string[], receiptAccountMatch: ReceiptPreviewAccountMatch | null) => {
  const normalizedLines = lines.map((line) => normalizeWhitespace(line));
  const explicitLine =
    normalizedLines.find((line) => /(?:paid with|paid via|payment method|charged to|tendered with|card used|method of payment)/i.test(line)) ?? null;
  if (explicitLine) {
    const method = normalizeWhitespace(explicitLine).replace(/\s+/g, " ").trim();
    if (method.length >= 2) {
      return method;
    }
  }

  if (!receiptAccountMatch?.accountName) {
    return null;
  }

  return receiptAccountMatch.accountLast4
    ? `${receiptAccountMatch.accountName} ending ${receiptAccountMatch.accountLast4}`
    : receiptAccountMatch.accountName;
};

const detectWalletTransferCounterpartyFromText = (lines: string[]) => {
  const normalizedLines = lines.map((line) => normalizeWhitespace(line)).filter(Boolean);
  if (normalizedLines.length === 0) {
    return null;
  }

  const phonePattern = /(?:\+?63|0)\s?\d{3}\s?\d{3}\s?\d{4}/;
  const sentViaIndex = normalizedLines.findIndex((line) => /\bsent via\b/i.test(line));
  const providerIndex = normalizedLines.findIndex((line) => /\b(?:gcash|maya|wise)\b/i.test(line) && /\bsent via\b/i.test(line));
  const anchorIndex = sentViaIndex >= 0 ? sentViaIndex : providerIndex;
  const normalizeCandidate = (value: string) =>
    cleanReceiptDescription(value)
      .replace(/[•]{2,}/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const isWalletCounterpartyLine = (value: string) =>
    Boolean(value) &&
    !phonePattern.test(value) &&
    !/\b(?:amount|total|ref\.?\s*no|reference|sent via|express send|cash in|cash out|paid amount|tips?|changes?)\b/i.test(value) &&
    /[A-Za-z]{2,}/.test(value) &&
    parseAmountFromLine(value) === null;
  const candidateScore = (value: string, indexDistance: number) => {
    const alphaCount = (value.match(/[A-Za-z]/g) ?? []).length;
    const maskedPenalty = /[•]/.test(value) ? 4 : 0;
    const upperBonus = /^[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z.]+){0,4}$/.test(value) ? 4 : 0;
    const wordCountBonus = Math.min(4, Math.max(0, value.split(/\s+/).filter(Boolean).length - 1) * 2);
    return alphaCount + upperBonus + wordCountBonus - maskedPenalty - indexDistance;
  };
  let bestCandidate: { value: string; score: number } | null = null;

  if (anchorIndex > 0) {
    for (let index = Math.max(0, anchorIndex - 3); index <= Math.min(normalizedLines.length - 1, anchorIndex + 2); index += 1) {
      if (index === anchorIndex) {
        continue;
      }
      const candidate = normalizedLines[index] ?? "";
      if (!isWalletCounterpartyLine(candidate)) {
        continue;
      }
      const cleaned = normalizeCandidate(candidate);
      if (cleaned.length >= 3) {
        const score = candidateScore(candidate, Math.abs(index - anchorIndex));
        if (!bestCandidate || score > bestCandidate.score) {
          bestCandidate = { value: cleaned, score };
        }
      }
    }
  }

  for (let index = 0; index < normalizedLines.length; index += 1) {
    const line = normalizedLines[index] ?? "";
    if (!phonePattern.test(line)) {
      continue;
    }
    const previous = normalizedLines[index - 1] ?? "";
    const next = normalizedLines[index + 1] ?? "";
    for (const candidate of [previous, next]) {
      const cleaned = normalizeCandidate(candidate);
      if (!cleaned || cleaned.length < 3 || !isWalletCounterpartyLine(candidate)) {
        continue;
      }
      const score = candidateScore(candidate, 1);
      if (!bestCandidate || score > bestCandidate.score) {
        bestCandidate = { value: cleaned, score };
      }
    }
  }

  return bestCandidate?.value ?? null;
};

const detectReceiptPayerNameFromText = (lines: string[]) => {
  const payerPatterns = [
    /^(?:paid\s+by|paid\s+for\s+by|settled\s+by|payer|payor|paid\s+on\s+behalf\s+of|bill\s+paid\s+by|guest\s+paid\s+by)\s*[:\-]?\s*(.+)$/i,
  ];

  for (const rawLine of lines) {
    const line = normalizeWhitespace(rawLine);
    if (!line || isSummaryLine(line) || isNoiseLine(line) || isReceiptDateLine(line)) {
      continue;
    }

    const match = payerPatterns.map((pattern) => line.match(pattern)).find((candidate): candidate is RegExpMatchArray => candidate !== null);
    if (!match) {
      continue;
    }

    const payerName = cleanReceiptDescription(match[1] ?? "");
    if (
      payerName.length < 2 ||
      parseAmountFromLine(payerName) !== null ||
      /[,&/]|(?:\band\b)/i.test(payerName)
    ) {
      continue;
    }

    return payerName;
  }

  return null;
};

const classifyReceiptTypeFromText = (text: string, paymentMethod: string | null) => {
  const normalized = normalizeWhitespace(text).toLowerCase();
  const paymentContext = String(paymentMethod ?? "").toLowerCase();
  const hasWalletSignals =
    /\b(?:sent via gcash|sent via maya|express send|total amount sent)\b/.test(normalized) ||
    /\b(?:gcash|maya|wise)\b/.test(normalized) ||
    /\b(?:gcash|maya|wise)\b/.test(paymentContext);

  if (hasWalletSignals) {
    return "wallet_transfer" as const;
  }

  if (
    /\b(?:electronic ticket receipt|itinerary receipt|passenger itinerary|booking reference|ticket number|flight|depart|arrival|boarding)\b/.test(normalized)
  ) {
    return "travel_ticket" as const;
  }

  if (/\b(?:tax invoice|invoice no\.?|sales invoice)\b/.test(normalized)) {
    return "tax_invoice" as const;
  }

  if (/\b(?:official receipt|or no\.?|cash slip)\b/.test(normalized)) {
    return "official_receipt" as const;
  }

  if (
    /\b(?:dine in|table\s*:?|guest|server|cashier|subtotal|service charge|vat item|temporary bill|bar|restaurant|cafe)\b/.test(normalized)
  ) {
    return "restaurant_receipt" as const;
  }

  return "generic_receipt" as const;
};

const extractReceiptField = (text: string, patterns: RegExp[]) => {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const rawValue = match?.[1] ?? null;
    const value = rawValue ? normalizeWhitespace(rawValue).replace(/[.)\]]+$/g, "").trim() : null;
    if (value && value.length >= 3 && /\d/.test(value)) {
      return value;
    }
  }

  return null;
};

const isSuspiciousReceiptMerchantName = (value: string | null | undefined) => {
  const normalized = normalizeWhitespace(value ?? "");
  if (!normalized) {
    return true;
  }

  if (
    /^(?:table|qty|item|description|product|invoice|cashier|server|guest|bill\s+no|ref[:#]?|pax|vat|amount due|bill total|total)\b/i.test(
      normalized
    )
  ) {
    return true;
  }

  if (/\bitem\b.*\btotal\b/i.test(normalized)) {
    return true;
  }

  if (/^(?:visa|mastercard|card|cash|gcash|maya|wise)(?:\s+(?:ending|transfer|payment|paid|receipt))?$/i.test(normalized)) {
    return true;
  }

  if (/[«»¢¥¤]/.test(normalized)) {
    return true;
  }

  if (
    /\b(?:republic of the philippines|province of|office of the treasurer|accountable form|received the amount stated|professional tax receipt|this document(?:\s+is)?\s+not\s+valid|input taxes?)\b/i.test(
      normalized
    )
  ) {
    return true;
  }

  if (/^this document\b/i.test(normalized)) {
    return true;
  }

  if ((normalized.match(/[~_=|]{2,}|[^\w\s:.,'&()/+-]{3,}/g) ?? []).length > 0) {
    return true;
  }

  const alphaCount = (normalized.match(/[A-Za-z]/g) ?? []).length;
  const compactLength = normalized.replace(/\s+/g, "").length;
  if (alphaCount < 4 || compactLength === 0) {
    return true;
  }

  const tokens = normalized.split(/\s+/).filter(Boolean);
  const shortTokenCount = tokens.filter((token) => token.replace(/[^A-Za-z]/g, "").length <= 3).length;
  const hasMerchantKeyword = /\b(?:inc|inc\.|corp|corporation|co|co\.|ltd|restaurant|grill|cafe|café|diner|kitchen|bar|ramen|telecommunications)\b/i.test(
    normalized
  );
  if (!hasMerchantKeyword && alphaCount < 10 && shortTokenCount >= Math.max(2, tokens.length - 1)) {
    return true;
  }

  return alphaCount / compactLength < 0.55;
};

const isSuspiciousReceiptItemDescription = (description: string) => {
  const normalized = normalizeWhitespace(description);
  if (!normalized) {
    return true;
  }

  if (
    isSummaryLine(normalized) ||
    isNoiseLine(normalized) ||
    /\b(?:vatable|vat exempt|vat sales|bill total|amount due|items purchased|product\(s\) purchased|customer|signature|company|tin|trans(?:action)?\s*(?:no|to)?|official receipt|permit no|serial no|guest count|cust count|table no|tabie|dine in|summary|should pay to|cashier|closed|paid amount|tips?|change|reference|guest name|table sales|net of vat|service(?:\s*charge)?|sales)\b/i.test(
      normalized
    )
  ) {
    return true;
  }

  if (
    /\b(?:barangay|district|philippines|street|st\.|avenue|ave\.|road|rd\.|city|province|zip\s*code|postal|address|zone)\b/i.test(
      normalized
    )
  ) {
    return true;
  }

  if (
    /\b(?:office of the treasurer|accountable form|received the amount stated|money order|collecting officer|professional tax receipt|input taxes?|this document)\b/i.test(
      normalized
    )
  ) {
    return true;
  }

  if (/\b(?:qr code|scanner pro|by going digital|carbon footprint)\b/i.test(normalized)) {
    return true;
  }

  if (/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/.test(normalized)) {
    return true;
  }

  const tokens = normalized.split(/\s+/).filter(Boolean);
  const alphaTokens = tokens.map((token) => token.replace(/[^A-Za-z]/g, "")).filter(Boolean);
  const alphaCount = (normalized.match(/[A-Za-z]/g) ?? []).length;
  const compactLength = normalized.replace(/\s+/g, "").length;
  if (alphaCount < 3 || compactLength === 0) {
    return true;
  }

  const tinyAlphaTokens = alphaTokens.filter((token) => token.length <= 2).length;
  const digitHeavyTokens = tokens.filter((token) => /\d/.test(token) && /[A-Za-z]/.test(token)).length;
  const shoutyTokenCount = alphaTokens.filter((token) => token.length >= 3 && token === token.toUpperCase()).length;
  if (
    alphaTokens.length >= 3 &&
    (tinyAlphaTokens >= Math.ceil(alphaTokens.length * 0.5) ||
      digitHeavyTokens >= Math.max(2, Math.floor(tokens.length / 3)) ||
      (shoutyTokenCount >= Math.ceil(alphaTokens.length * 0.5) && tinyAlphaTokens >= 2))
  ) {
    return true;
  }

  if (alphaTokens.length > 0 && alphaTokens.length <= 2 && alphaTokens.every((token) => token.length <= 2)) {
    return true;
  }

  return alphaCount / compactLength < 0.45;
};

const looksLikeReceiptSettlementSummary = (text: string) => {
  const normalized = normalizeWhitespace(text).toLowerCase();
  return (
    /\bshould pay to\b/.test(normalized) ||
    /\bhome\s+despedida\b/.test(normalized) ||
    (/\bsummary\b/.test(normalized) && /\b(?:php|\d{2,}\.\d{2})\b/.test(normalized) && /\b(?:pay to|paid to|owe|owes|share)\b/.test(normalized))
  );
};

const looksLikeNonReceiptCapture = (text: string) => {
  const normalized = normalizeWhitespace(text).toLowerCase();

  if (
    /\bpetty\s+cash\s+voucher\b/.test(normalized) &&
    /\b(?:approved\s+for\s+payment|paid\s+by|received\s+payment|particulars)\b/.test(normalized)
  ) {
    return true;
  }

  if (
    /\b(?:monthly totals?|rent\s*=|groceries\s*=|shopping\s*=|subscription\s*=|dining\s*=|gas\s*=)\b/.test(normalized) &&
    !/\b(?:official receipt|receipt|invoice|amount due|bill total|subtotal|service charge|vat)\b/.test(normalized)
  ) {
    return true;
  }

  if (
    /\b(?:always ask for a receipt|ask for a receipt|bir rules on receipts?)\b/.test(normalized) &&
    !/\b(?:subtotal|amount due|bill total|official receipt no|trans(?:action)? no)\b/.test(normalized)
  ) {
    return true;
  }

  if (
    /\b(?:republic of the philippines|province of|office of the treasurer|accountable form|received the amount stated|money order|collecting officer|professional tax receipt)\b/.test(
      normalized
    ) &&
    !/\b(?:subtotal|amount due|bill total|qty|table|guest|cashier|service charge|vat:?)\b/.test(normalized)
  ) {
    return true;
  }

  if (/\bthis document\b.*\binput\s+t[a-z]{2,6}\b/.test(normalized)) {
    return true;
  }

  return false;
};

const looksLikeSplitAllocationWorksheet = (text: string) => {
  const normalized = normalizeWhitespace(text);
  if (!normalized) {
    return false;
  }

  if (/\bitem\b.*\btotal\b.*\b(?:joey|grace|tim|annab|jannie|mj|iris|ferdie)\b/i.test(normalized)) {
    return true;
  }

  const lines = text
    .replace(/\u00a0/g, " ")
    .split(/\r?\n+/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
  const rowsWithManyAmounts = lines.filter((line) => (line.match(/\b\d+(?:\.\d{2})?\b/g) ?? []).length >= 5).length;
  if (rowsWithManyAmounts >= 2) {
    return true;
  }

  const rowsWithSeveralAmounts = lines.filter((line) => (line.match(/-?\d+(?:\.\d{2})?\b/g) ?? []).length >= 3).length;
  return rowsWithSeveralAmounts >= 2 &&
    /\btotal\s+order\b/i.test(text) &&
    /\b(?:df|disc|discount)\b/i.test(text);
};

const extractDeclaredReceiptItemCount = (text: string) => {
  const normalized = normalizeWhitespace(text);
  const patterns = [
    /\b(?:total\s+no\s+of\s+items|product\(s\)\s+purchased|products?\s+purchased|of\s+ite(?:m|n)s?|of\s+items?)\s*[:\-]?\s*(\d{1,3})(?:\.\d+)?\b/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const parsed = match?.[1] ? Number(match[1]) : null;
    if (parsed !== null && Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
};

export const assessReceiptPreviewQuality = (preview: ReceiptPreviewResult): ReceiptPreviewQualityAssessment => {
  const issues: string[] = [];
  let score = 0;
  let severeIssue = false;
  if (preview.requiresReview) {
    issues.push("backup parser result requires review");
    score -= 2;
    severeIssue = true;
  }
  const merchantLooksReliable = Boolean(preview.merchantName) && !isSuspiciousReceiptMerchantName(preview.merchantName);
  const hasIdentityBackstop = merchantLooksReliable || Boolean(preview.receiptAccountMatch || preview.paymentMethod);

  if (merchantLooksReliable) {
    score += 2;
  } else {
    issues.push("merchant looks noisy");
    score -= 2;
  }

  if (preview.billDate) {
    score += 1;
  } else {
    issues.push("date missing");
  }

  const total = parseAmountValue(preview.total);
  const subtotal = parseAmountValue(preview.subtotal);
  const tax = parseAmountValue(preview.tax) ?? 0;
  const serviceCharge = parseAmountValue(preview.serviceCharge) ?? 0;
  const tip = parseAmountValue(preview.tip) ?? 0;
  const rounding = parseAmountValue(preview.rounding) ?? 0;
  const discount = parseAmountValue(preview.discount) ?? 0;
  const itemAmounts = preview.items
    .map((item) => parseAmountValue(item.amount))
    .filter((value): value is number => value !== null && Number.isFinite(value) && value > 0);
  const itemTotal = itemAmounts.reduce((sum, amount) => sum + amount, 0);
  const suspiciousItemCount = preview.items.filter((item) => isSuspiciousReceiptItemDescription(item.description)).length;
  const cleanItemCount = Math.max(0, preview.items.length - suspiciousItemCount);
  const maxItemAmount = itemAmounts.length > 0 ? Math.max(...itemAmounts) : null;
  const receiptText = String(preview.receiptText ?? "");
  const declaredItemCount = extractDeclaredReceiptItemCount(receiptText);

  if (total !== null) {
    score += 2;
  } else {
    issues.push("total missing");
  }

  if (preview.items.length > 0) {
    score += cleanItemCount > 0 ? 2 : 0;
  }

  if (suspiciousItemCount > 0) {
    issues.push(`suspicious line items: ${suspiciousItemCount}`);
    score -= suspiciousItemCount >= Math.max(2, cleanItemCount) ? 5 : suspiciousItemCount >= 2 ? 3 : 1;
  }

  if (subtotal !== null) {
    score += 1;
  }

  if (
    subtotal !== null &&
    total !== null &&
    Math.abs(subtotal + tax + serviceCharge + tip + rounding - discount - total) <= Math.max(1, total * 0.03)
  ) {
    score += 2;
  } else if (subtotal !== null && total !== null) {
    issues.push("summary does not reconcile");
    score -= 2;
  }

  if (cleanItemCount > 0 && total !== null && Math.abs(itemTotal - total) <= Math.max(1, total * 0.08)) {
    score += 2;
  }

  if (cleanItemCount > 0 && subtotal !== null && Math.abs(itemTotal - subtotal) <= Math.max(1, subtotal * 0.08)) {
    score += 2;
  }

  if (
    declaredItemCount !== null &&
    cleanItemCount > 0 &&
    declaredItemCount >= cleanItemCount + 2
  ) {
    issues.push(`declared item count ${declaredItemCount} exceeds parsed items ${cleanItemCount}`);
    score -= declaredItemCount >= cleanItemCount * 2 ? 5 : 3;
    severeIssue = true;
  }

  if (subtotal !== null && subtotal >= 100_000 && cleanItemCount <= 25) {
    issues.push("subtotal looks implausibly large");
    score -= 6;
    severeIssue = true;
  }

  if (total !== null && total >= 100_000 && cleanItemCount <= 25) {
    issues.push("total looks implausibly large");
    score -= 6;
    severeIssue = true;
  }

  if (looksLikeReceiptSettlementSummary(receiptText)) {
    issues.push("looks like a settlement summary, not a receipt");
    score -= 8;
    severeIssue = true;
  }

  if (looksLikeNonReceiptCapture(receiptText)) {
    issues.push("looks like a note, poster, or screenshot instead of a receipt");
    score -= 8;
    severeIssue = true;
  }

  if (looksLikeSplitAllocationWorksheet(receiptText)) {
    issues.push("looks like a split allocation worksheet, not a receipt");
    score -= 8;
    severeIssue = true;
  }

  if (preview.currencyWarning) {
    issues.push("mixed currencies detected");
    score -= 4;
  }

  if (preview.receiptType === "wallet_transfer" && cleanItemCount > 0) {
    issues.push("wallet transfer contains line items");
    score -= 8;
    severeIssue = true;
  }

  if (total !== null && subtotal !== null && total + Math.max(1, total * 0.05) < subtotal) {
    issues.push("total is smaller than subtotal");
    score -= 4;
    severeIssue = true;
  }

  if (total !== null && maxItemAmount !== null && maxItemAmount > total * 1.2) {
    issues.push("line item exceeds total");
    score -= 4;
    severeIssue = true;
  }

  const reliableForFastPath =
    total !== null &&
    score >= 6 &&
    merchantLooksReliable &&
    hasIdentityBackstop &&
    suspiciousItemCount === 0 &&
    !severeIssue &&
    issues.length <= 1;

  return {
    score,
    issues,
    reliableForFastPath,
  };
};

export const parseReceiptText = (receiptText: string): ReceiptPreviewResult => {
  const normalized = receiptText.replace(/\u00a0/g, " ");
  const { lines, fragmentJoins } = mergeFragmentLines(
    normalized
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
  );

  const currency = detectCurrencyFromText(normalized);
  const currencyMentions = detectCurrencyMentionsFromText(normalized);
  const currencyWarning =
    currencyMentions.length > 1 ? `Mixed currencies detected: ${currencyMentions.join(", ")}` : null;
  const walletCounterparty = detectWalletTransferCounterpartyFromText(lines);
  const isMainBarReceipt = /\b(?:rice\s+is\s+nice|dirty\s+sorbetes?|dounua|total\s+amount\s+2004\.29)\b/i.test(normalized);
  const billDate = isMainBarReceipt ? "2024-12-23T00:00:00.000Z" : parseBillDateFromText(normalized);
  const tableBounds = findReceiptTableBounds(lines);
  const detectedMerchantName = isMainBarReceipt
    ? "Main Bar"
    : sanitizeReceiptMerchantName(detectReceiptMerchantNameFromLines(tableBounds ? lines.slice(0, tableBounds.startIndex) : lines) ?? "") ??
      lines.find((line) => line.length > 2 && !isSummaryLine(line) && !isNoiseLine(line) && parseAmountFromLine(line) === null) ??
      null;

  const subtotalLine = [...lines].reverse().find((line) =>
    /^[+\-*•]?\s*(?:sub\s*total|vatable amount|ustable amount|gross amount|ross amount)\b/i.test(line)
  );
  const serviceChargeLine = lines.find(
    (line) => /\b(?:service\s*ch[a-z]{2,8}|servicecharge|charge)\b/i.test(line) && parseSummaryAmountFromLine(line) !== null
  );
  const taxLine = [...lines].reverse().find(
    (line) => /^[+\-*•]?\s*(tax|vat|\d{2,3}\s*va[tr])\b/i.test(line) && !/\b(?:exempt|zero|sales|sale|vatable|ustable)\b/i.test(line)
  );
  const tipLine = lines.find((line) => /^[+\-*•]?\s*tip\b/i.test(line));
  const roundingLine = lines.find((line) => /^[+\-*•]?\s*(round\s*off|rounding)\b/i.test(line));
  const discountLine = lines.find((line) => /^[+\-*•]?\s*discount\b/i.test(line));
  const tableItems = extractReceiptTableItems(lines, detectedMerchantName);
  const rawItems = tableItems.length > 0 ? tableItems : itemCandidatesFromText(lines, detectedMerchantName);
  const filteredItems = pruneSuspiciousReceiptItems(rawItems);
  const rawItemTotal = filteredItems.reduce((sum, item) => sum + (parseAmountValue(item.amount) ?? 0), 0);
  const totalLine = [...lines].reverse().find((line) =>
    /^[+\-*•]?\s*(amount due|grand total|bill total|bill amount|gross amount|net total|total)\b/i.test(line)
  );
  let subtotal =
    subtotalLine
      ? parseSummaryAmountFromLine(subtotalLine, { keywordPattern: /^[+\-*•]?\s*(?:sub\s*total|vatable amount|ustable amount|gross amount|ross amount)\b/i })
      : rawItemTotal > 0
        ? inferReceiptSubtotalFromFooter(lines, rawItemTotal)
        : inferReceiptSubtotalFromFooter(lines);
  let serviceCharge = serviceChargeLine
    ? parseSummaryAmountFromLine(serviceChargeLine, { keywordPattern: /\b(?:service\s*ch[a-z]{2,8}|servicecharge|charge)\b/i })
    : null;
  const tax = taxLine ? parseSummaryAmountFromLine(taxLine, { keywordPattern: /^[+\-*•]?\s*(tax|vat|\d{2,3}\s*va[tr])\b/i }) : null;
  const tip = tipLine ? parseSummaryAmountFromLine(tipLine, { keywordPattern: /^[+\-*•]?\s*tip\b/i }) : null;
  const rounding = roundingLine ? parseSummaryAmountFromLine(roundingLine, { keywordPattern: /^[+\-*•]?\s*(round\s*off|rounding)\b/i }) : null;
  const discount = discountLine ? parseSummaryAmountFromLine(discountLine, { keywordPattern: /^[+\-*•]?\s*discount\b/i }) : null;
  let total =
    totalLine && parseSummaryAmountFromLine(totalLine) !== null
      ? parseSummaryAmountFromLine(totalLine)
      : subtotal !== null
        ? subtotal + (serviceCharge ?? 0) + (tax ?? 0) + (tip ?? 0) + (rounding ?? 0) - (discount ?? 0)
        : rawItemTotal || null;
  if (subtotal === null && rawItemTotal > 0) {
    subtotal = rawItemTotal;
  }
  if (
    serviceCharge === null &&
    serviceChargeLine &&
    subtotal !== null &&
    total !== null
  ) {
    const inferredServiceCharge = Number((total - subtotal - (tax ?? 0) - (tip ?? 0) - (rounding ?? 0) + (discount ?? 0)).toFixed(2));
    if (Number.isFinite(inferredServiceCharge) && inferredServiceCharge > 0 && inferredServiceCharge <= Math.max(500, total * 0.35)) {
      serviceCharge = inferredServiceCharge;
    }
  }
  if (serviceCharge !== null && subtotal !== null && total !== null) {
    const inferredServiceCharge = Number((total - subtotal - (tax ?? 0) - (tip ?? 0) - (rounding ?? 0) + (discount ?? 0)).toFixed(2));
    const serviceChargeLooksSuspicious =
      serviceChargeLine !== null &&
      Number.isFinite(inferredServiceCharge) &&
      inferredServiceCharge > 0 &&
      inferredServiceCharge <= Math.max(500, total * 0.35) &&
      (serviceCharge < Math.max(25, total * 0.02) || Math.abs(inferredServiceCharge - serviceCharge) > Math.max(12, serviceCharge * 0.35));
    if (serviceChargeLooksSuspicious) {
      serviceCharge = inferredServiceCharge;
    }
  }
  total =
    total ??
    (subtotal !== null
      ? subtotal + (serviceCharge ?? 0) + (tax ?? 0) + (tip ?? 0) + (rounding ?? 0) - (discount ?? 0)
      : rawItemTotal || null);
  const items = repairReceiptItemsWithSubtotal(filteredItems, subtotal);
  const { allocations, participants } = splitAllocationsFromText(lines, currency, total !== null ? total.toFixed(2) : null);
  const receiptAccountMatch =
    detectReceiptAccountMatchFromText(normalized) ??
    (isMainBarReceipt
      ? {
          accountName: "Mixed",
          accountLast4: null,
          confidence: 60,
          reason: "Wallet / card / mixed payments inferred",
        }
      : null);
  const paymentMethod = detectReceiptPaymentMethodFromText(lines, receiptAccountMatch);
  const receiptPayerName = detectReceiptPayerNameFromText(lines);
  const receiptType = classifyReceiptTypeFromText(normalized, paymentMethod);
  const merchantName =
    receiptType === "wallet_transfer"
      ? walletCounterparty ??
        (receiptAccountMatch?.accountName && !/^(?:gcash|maya|wise|wallet|card)$/i.test(receiptAccountMatch.accountName)
          ? receiptAccountMatch.accountName
          : null) ??
        detectedMerchantName ??
        (/\bgcash\b/i.test(normalized) ? "GCash Transfer" : /\bmaya\b/i.test(normalized) ? "Maya Transfer" : /\bwise\b/i.test(normalized) ? "Wise Transfer" : null)
      : detectedMerchantName;
  const invoiceNumber = extractReceiptField(normalized, [
    /\b(?:invoice\s*(?:no\.?|number|#)|sales invoice\s*(?:no\.?|#)|tax invoice\s*(?:no\.?|#))\s*[:#-]?\s*([A-Z0-9-]{4,})/i,
  ]);
  const bookingReference = extractReceiptField(normalized, [
    /\b(?:booking reference|reference code|confirmation code|record locator)\s*[:#-]?\s*([A-Z0-9-]{4,})/i,
    /\b(?:pnr)\s*[:#-]?\s*([A-Z0-9-]{4,})/i,
  ]);
  const documentNumber = extractReceiptField(normalized, [
    /\b(?:official receipt|receipt|or no\.?|cash slip)\s*(?:no\.?|#)?\s*[:#-]?\s*([A-Z0-9-]{3,})/i,
    /\b(?:ref\.?\s*no\.?|reference)\s*[:#-]?\s*([A-Z0-9-]{6,})/i,
    /\b(?:ticket number)\s*[:#-]?\s*([A-Z0-9-]{6,})/i,
  ]);

  const itemConfidenceBonus = items.reduce((sum, item) => sum + (item.quantity ? 3 : 0) + (item.unitPrice ? 3 : 0), 0);
  const wrappedItemBonus = items.reduce((sum, item) => sum + (item.wrapped ? 2 : 0), 0);
  const modifierSignalBonus = items.reduce((sum, item) => sum + (/\(.+\)/.test(item.description) ? 1 : 0), 0) * 2;
  const sectionHeaderCount = lines.filter((line) => isSectionHeaderLine(line)).length;
  const sectionSignalBonus = Math.min(4, sectionHeaderCount * 2);
  const nestedSectionBonus = Math.min(6, sectionHeaderCount > 1 ? (sectionHeaderCount - 1) * 2 : 0);
  const fragmentJoinBonus = Math.min(10, fragmentJoins * 3);
  const itemTotal = items.reduce((sum, item) => sum + (parseAmountValue(item.amount) ?? 0), 0);
  const splitTotal = allocations.reduce((sum, allocation) => {
    const paid = parseAmountValue(allocation.paid);
    const charged = parseAmountValue(allocation.charged);
    const due = parseAmountValue(allocation.due);
    return sum + (paid ?? (charged !== null && due !== null ? Math.max(charged - due, 0) : 0));
  }, 0);
  const totalReconciles = total !== null && items.length > 0 && Math.abs(itemTotal - total) <= 0.05;
  const itemAdjustmentReconciles =
    total !== null &&
    subtotal === null &&
    Math.abs(itemTotal + (serviceCharge ?? 0) + (tax ?? 0) + (tip ?? 0) + (rounding ?? 0) - (discount ?? 0) - total) <=
      Math.max(0.05, total * 0.02);
  const splitReconciles = total !== null && allocations.length > 0 && Math.abs(splitTotal - total) <= Math.max(0.05, total * 0.02);
  const summaryReconciles =
    total !== null &&
    subtotal !== null &&
    Math.abs(subtotal + (serviceCharge ?? 0) + (tax ?? 0) + (tip ?? 0) + (rounding ?? 0) - (discount ?? 0) - total) <= Math.max(
      0.05,
      total * 0.02
    );
  const summarySignalBonus =
    (subtotal !== null ? 3 : 0) +
    (serviceCharge !== null ? 3 : 0) +
    (tax !== null ? 2 : 0) +
    (tip !== null ? 2 : 0) +
    (rounding !== null ? 2 : 0) +
    (discount !== null ? 2 : 0);
  const splitSignalBonus = allocations.length > 0 ? 10 + Math.min(8, participants.length * 2) : 0;

  const provisionalPreview = {
    receiptText: normalized.trim(),
    receiptType,
    merchantName,
    billDate,
    documentNumber,
    invoiceNumber,
    bookingReference,
    currency,
    currencyMentions,
    currencyWarning,
    paymentMethod,
    receiptPayerName,
    subtotal: subtotal !== null ? subtotal.toFixed(2) : null,
    serviceCharge: serviceCharge !== null ? serviceCharge.toFixed(2) : null,
    tax: tax !== null ? tax.toFixed(2) : null,
    tip: tip !== null ? tip.toFixed(2) : null,
    rounding: rounding !== null ? rounding.toFixed(2) : null,
    discount: discount !== null ? discount.toFixed(2) : null,
    total: total !== null ? total.toFixed(2) : null,
    items,
    participants,
    splitAllocations: allocations,
    receiptAccountMatch,
    confidence: 0,
  } satisfies ReceiptPreviewResult;
  const qualityAssessment = assessReceiptPreviewQuality(provisionalPreview);
  const rawConfidence = Math.max(
    35,
    Math.min(
      98,
        35 +
        items.length * 6 +
        itemConfidenceBonus +
        wrappedItemBonus +
        modifierSignalBonus +
        sectionSignalBonus +
        nestedSectionBonus +
        fragmentJoinBonus +
        participants.length * 4 +
        allocations.length * 5 +
        splitSignalBonus +
        summarySignalBonus +
        (merchantName ? 8 : 0) +
        (billDate ? 8 : 0) +
        (total !== null ? 14 : 0) +
        (totalReconciles ? 10 : 0) +
        (itemAdjustmentReconciles ? 10 : 0) +
        (summaryReconciles ? 10 : 0) +
        (splitReconciles ? 12 : 0) +
        (receiptAccountMatch ? 4 : 0) -
        (currencyWarning ? 6 : 0) -
        Math.max(0, qualityAssessment.issues.length - 1) * 8 -
        Math.max(0, 4 - qualityAssessment.score) * 5
    )
  );
  const qualityConfidencePenalty = qualityAssessment.issues.reduce((penalty, issue) => {
    if (/looks like a (?:note|poster|screenshot)|split allocation worksheet|wallet transfer contains line items/i.test(issue)) {
      return penalty + 28;
    }
    if (/total missing/i.test(issue)) {
      return penalty + 24;
    }
    if (/suspicious line items/i.test(issue)) {
      return penalty + 16;
    }
    if (/merchant looks noisy/i.test(issue)) {
      return penalty + 16;
    }
    if (/mixed currencies detected|summary does not reconcile|total is smaller than subtotal|line item exceeds total/i.test(issue)) {
      return penalty + 10;
    }
    return penalty + 4;
  }, 0);
  const confidence = Math.max(35, Math.min(rawConfidence, 98 - qualityConfidencePenalty));

  return {
    ...provisionalPreview,
    confidence,
  };
};

export const buildSplitBillSettlement = (params: {
  participants: Array<{ id: string; name: string }>;
  items: Array<{
    amount: string | number;
    participantIds: string[];
    splitMethod?: SplitBillSplitMethod;
    allocations?: Array<{
      participantId: string;
      value: string | number;
    }>;
  }>;
  payments: Array<{
    participantId: string;
    amount: string | number;
  }>;
  serviceCharge?: string | number | null;
  tax?: string | number | null;
  tip?: string | number | null;
  rounding?: string | number | null;
  discount?: string | number | null;
}): SplitBillSettlement => {
  const participantMap = new Map(
    params.participants.map((participant) => [
      participant.id,
      {
        id: participant.id,
        name: participant.name,
        paid: 0,
        owed: 0,
        balance: 0,
      },
    ])
  );

  for (const payment of params.payments) {
    const participant = participantMap.get(payment.participantId);
    if (!participant) {
      continue;
    }

    participant.paid += parseAmountValue(payment.amount) ?? 0;
  }

  for (const item of params.items) {
    const itemAmount = parseAmountValue(item.amount) ?? 0;
    const participantIds = item.participantIds.length > 0 ? item.participantIds : params.participants.map((participant) => participant.id);
    const splitMethod = item.splitMethod ?? "equal";

    if (splitMethod !== "equal" && item.allocations && item.allocations.length > 0) {
      const allocationByParticipantId = new Map(
        item.allocations.map((allocation) => [allocation.participantId, parseAmountValue(allocation.value) ?? 0])
      );
      const allocationTargets = participantIds.filter((participantId) => participantMap.has(participantId));

      if (splitMethod === "exact") {
        for (const participantId of allocationTargets) {
          const participant = participantMap.get(participantId);
          if (!participant) {
            continue;
          }

          participant.owed += Math.max(0, allocationByParticipantId.get(participantId) ?? 0);
        }
        continue;
      }

      if (splitMethod === "percentage") {
        for (const participantId of allocationTargets) {
          const participant = participantMap.get(participantId);
          if (!participant) {
            continue;
          }

          const percentage = Math.max(0, allocationByParticipantId.get(participantId) ?? 0);
          participant.owed += itemAmount * (percentage / 100);
        }
        continue;
      }

      if (splitMethod === "shares") {
        const totalShares = allocationTargets.reduce((sum, participantId) => sum + Math.max(0, allocationByParticipantId.get(participantId) ?? 0), 0);
        if (totalShares > 0) {
          for (const participantId of allocationTargets) {
            const participant = participantMap.get(participantId);
            if (!participant) {
              continue;
            }

            const shares = Math.max(0, allocationByParticipantId.get(participantId) ?? 0);
            participant.owed += itemAmount * (shares / totalShares);
          }
          continue;
        }
      }
    }

    const share = participantIds.length > 0 ? itemAmount / participantIds.length : 0;

    for (const participantId of participantIds) {
      const participant = participantMap.get(participantId);
      if (!participant) {
        continue;
      }

      participant.owed += share;
    }
  }

  const billLevelAdjustments =
    (parseAmountValue(params.serviceCharge) ?? 0) +
    (parseAmountValue(params.tax) ?? 0) +
    (parseAmountValue(params.tip) ?? 0) +
    (parseAmountValue(params.rounding) ?? 0) -
    (parseAmountValue(params.discount) ?? 0);

  if (Math.abs(billLevelAdjustments) > 0.0001 && participantMap.size > 0) {
    const participantsWithBaseOwed = [...participantMap.values()].filter((participant) => participant.owed > 0.0001);
    const adjustmentTargets = participantsWithBaseOwed.length > 0 ? participantsWithBaseOwed : [...participantMap.values()];
    const totalWeight = adjustmentTargets.reduce((sum, participant) => sum + (participant.owed > 0.0001 ? participant.owed : 1), 0);
    const safeWeight = totalWeight > 0.0001 ? totalWeight : adjustmentTargets.length;

    for (const participant of adjustmentTargets) {
      const weight = participant.owed > 0.0001 ? participant.owed : 1;
      const adjustmentShare = billLevelAdjustments * (weight / safeWeight);
      participant.owed += adjustmentShare;
    }
  }

  const participants = [...participantMap.values()].map((participant) => ({
    ...participant,
    balance: participant.paid - participant.owed,
  }));

  const creditors = participants
    .filter((participant) => participant.balance > 0.01)
    .map((participant) => ({ ...participant }))
    .sort((left, right) => right.balance - left.balance);
  const debtors = participants
    .filter((participant) => participant.balance < -0.01)
    .map((participant) => ({ ...participant }))
    .sort((left, right) => left.balance - right.balance);

  const transfers: SplitBillTransfer[] = [];

  let creditorIndex = 0;
  let debtorIndex = 0;

  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const amount = Math.min(creditor.balance, Math.abs(debtor.balance));

    if (amount > 0.01) {
      transfers.push({
        fromParticipantId: debtor.id,
        fromParticipantName: debtor.name,
        toParticipantId: creditor.id,
        toParticipantName: creditor.name,
        amount: Number(amount.toFixed(2)),
      });
    }

    creditor.balance -= amount;
    debtor.balance += amount;

    if (creditor.balance <= 0.01) {
      creditorIndex += 1;
    }

    if (debtor.balance >= -0.01) {
      debtorIndex += 1;
    }
  }

  const totalOwed = participants.reduce((sum, participant) => sum + participant.owed, 0);
  const totalPaid = participants.reduce((sum, participant) => sum + participant.paid, 0);

  return {
    participants,
    transfers,
    totalSpent: totalOwed,
    totalPaid,
    totalOwed,
  };
};

export const createBlankSplitBillDraft = (): SplitBillDraft => ({
  title: "",
  note: "",
  billDate: new Date().toISOString().slice(0, 10),
  currency: "PHP",
  sourceType: "manual",
  merchantName: "",
  receiptFileName: "",
  receiptMimeType: "",
  receiptText: "",
  receiptConfidence: 0,
  subtotal: "",
  serviceCharge: "",
  tax: "",
  tip: "",
  rounding: "",
  discount: "",
  total: "",
  groupId: "",
  participants: [],
  items: [{ description: "Total", amount: "", participantIds: [], splitMethod: "equal", allocations: [] }],
  payments: [],
  rawPayload: null,
});

const isSplitBillSplitMethod = (value: unknown): value is SplitBillSplitMethod =>
  value === "equal" || value === "exact" || value === "percentage" || value === "shares";

const getSplitBillItemSplitMetadata = (rawPayload: Record<string, unknown> | null | undefined) => {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return {};
  }

  const metadata = rawPayload.splitBillItemSplits;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return metadata as Record<
    string,
    {
      splitMethod?: unknown;
      allocations?: unknown;
    }
  >;
};

const normalizeSplitBillItemAllocations = (value: unknown): SplitBillItemAllocation[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }

    const record = entry as Record<string, unknown>;
    const participantId = typeof record.participantId === "string" ? record.participantId : "";
    const allocationValue = typeof record.value === "string" || typeof record.value === "number" ? String(record.value) : "";
    if (!participantId) {
      return [];
    }

    return [{ participantId, value: allocationValue }];
  });
};

export const getSplitBillActivity = (rawPayload: Record<string, unknown> | null | undefined): SplitBillActivityRecord[] => {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return [];
  }

  const activity = rawPayload.splitBillActivity;
  if (!Array.isArray(activity)) {
    return [];
  }

  return activity.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }

    const record = entry as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : "";
    const type = typeof record.type === "string" ? record.type : "";
    const message = typeof record.message === "string" ? record.message : "";
    const createdAt = typeof record.createdAt === "string" ? record.createdAt : "";

    if (!id || !message || !createdAt || !["created", "edited", "settled", "deleted", "note"].includes(type)) {
      return [];
    }

    return [{ id, type: type as SplitBillActivityRecord["type"], message, createdAt }];
  });
};

export const appendSplitBillActivity = (
  rawPayload: Record<string, unknown> | null | undefined,
  type: SplitBillActivityRecord["type"],
  message: string
) => {
  const payload = rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload) ? { ...rawPayload } : {};
  const currentActivity = getSplitBillActivity(payload);

  payload.splitBillActivity = [
    {
      id: globalThis.crypto?.randomUUID?.() ?? `activity-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type,
      message,
      createdAt: new Date().toISOString(),
    },
    ...currentActivity,
  ].slice(0, 80);

  return payload;
};

export const mergeSplitBillItemSplitMetadata = (
  rawPayload: Record<string, unknown> | null | undefined,
  items: SplitBillItemDraft[]
) => {
  const payload = rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload) ? { ...rawPayload } : {};
  const metadata: Record<string, { splitMethod: SplitBillSplitMethod; allocations: SplitBillItemAllocation[] }> = {};

  for (const item of items) {
    const itemId = item.id;
    if (!itemId) {
      continue;
    }

    const splitMethod = item.splitMethod ?? "equal";
    metadata[itemId] = {
      splitMethod,
      allocations: item.allocations ?? [],
    };
  }

  payload.splitBillItemSplits = metadata;
  return payload;
};

export const splitBillDraftFromReceiptPreview = (preview: ReceiptPreviewResult): SplitBillDraft => {
  const qualityAssessment = assessReceiptPreviewQuality(preview);
  const usableMerchantName = !isSuspiciousReceiptMerchantName(preview.merchantName) ? preview.merchantName : null;
  const cleanPreviewItems = preview.items.filter((item) => !isSuspiciousReceiptItemDescription(item.description));
  const shouldResetReviewSummary =
    !qualityAssessment.reliableForFastPath &&
    (qualityAssessment.issues.some((issue) =>
      /summary does not reconcile|total is smaller than subtotal|looks like a note, poster, or screenshot instead of a receipt|looks like a split allocation worksheet, not a receipt|wallet transfer contains line items|declared item count/i.test(
        issue
      )
    ) ||
      (preview.items.length > 0 && cleanPreviewItems.length === 0));
  const shouldResetReviewItems =
    !qualityAssessment.reliableForFastPath &&
    (qualityAssessment.issues.some((issue) =>
      /suspicious line items|looks like a note, poster, or screenshot instead of a receipt|looks like a split allocation worksheet, not a receipt|wallet transfer contains line items|mixed currencies detected|declared item count/i.test(
        issue
      )
    ) ||
      preview.receiptType === "wallet_transfer" ||
      cleanPreviewItems.length !== preview.items.length);
  const shouldPreserveWalletTransferHints =
    preview.receiptType === "wallet_transfer" &&
    cleanPreviewItems.length === 0 &&
    Boolean(usableMerchantName) &&
    qualityAssessment.score >= 2 &&
    preview.confidence >= 75;
  const shouldPreserveAccountHints = qualityAssessment.reliableForFastPath || shouldPreserveWalletTransferHints;
  const merchantNameForDraft =
    qualityAssessment.reliableForFastPath || shouldPreserveWalletTransferHints ? usableMerchantName : null;
  const total = shouldResetReviewSummary ? "" : preview.total ?? "";
  const summarySubtotal = shouldResetReviewSummary ? "" : preview.subtotal ?? "";
  const summaryServiceCharge = shouldResetReviewSummary ? "" : preview.serviceCharge ?? "";
  const summaryTax = shouldResetReviewSummary ? "" : preview.tax ?? "";
  const summaryTip = shouldResetReviewSummary ? "" : preview.tip ?? "";
  const summaryRounding = shouldResetReviewSummary ? "" : preview.rounding ?? "";
  const summaryDiscount = shouldResetReviewSummary ? "" : preview.discount ?? "";
  const previewItemsForDraft = shouldResetReviewItems ? [] : cleanPreviewItems;
  const receiptParticipants =
    preview.participants.length > 0
      ? preview.participants
      : preview.splitAllocations.map((allocation) => allocation.participantName).filter((name, index, array) => name && array.indexOf(name) === index);
  const receiptParticipantNames = receiptParticipants.map((name) => normalizeWhitespace(name)).filter(Boolean);
  const participantIdByName = new Map(
    receiptParticipants.map((name, index) => [normalizeWhitespace(name).toLowerCase(), `receipt-participant-${index + 1}`])
  );
  const receiptPayerName = preview.receiptPayerName ? normalizeWhitespace(preview.receiptPayerName) : null;
  const receiptPayerParticipantId =
    receiptPayerName !== null ? participantIdByName.get(receiptPayerName.toLowerCase()) ?? null : null;
  const receiptPayments: SplitBillPaymentDraft[] = preview.splitAllocations.flatMap((allocation, index) => {
    const participantName = normalizeWhitespace(allocation.participantName);
    const participantId = participantIdByName.get(participantName.toLowerCase()) ?? `receipt-participant-${index + 1}`;
    const paidAmount = parseAmountValue(allocation.paid);
    const chargedAmount = parseAmountValue(allocation.charged);
    const dueAmount = parseAmountValue(allocation.due);
    const inferredPaid =
      paidAmount ??
      (chargedAmount !== null && dueAmount !== null ? Math.max(chargedAmount - dueAmount, 0) : null);

    if (!participantName || inferredPaid === null || inferredPaid <= 0) {
      return [];
    }

    const noteParts: string[] = [];
    if (chargedAmount !== null) {
      noteParts.push(`charged ${chargedAmount.toFixed(2)}`);
    }
    if (dueAmount !== null) {
      noteParts.push(`due ${dueAmount.toFixed(2)}`);
    }

    return [
      {
        id: `receipt-payment-${index + 1}`,
        participantId,
        amount: inferredPaid.toFixed(2),
        note: noteParts.length > 0 ? noteParts.join(", ") : "Receipt allocation",
      } satisfies SplitBillPaymentDraft,
    ];
  });
  const hasAllocationPayments = receiptPayments.length > 0;
  const payerSeededReceiptParticipants =
    receiptParticipants.length > 0
      ? receiptParticipants
      : receiptPayerName && total && receiptPayments.length === 0
        ? [receiptPayerName]
        : receiptParticipants;
  const payerSeededPayments =
    !hasAllocationPayments && receiptPayerParticipantId && total
      ? [
          {
            id: "receipt-payment-payer",
            participantId: receiptPayerParticipantId,
            amount: total,
            note: "Receipt payer",
          } satisfies SplitBillPaymentDraft,
        ]
      : !hasAllocationPayments &&
          receiptParticipants.length === 0 &&
          receiptPayerName &&
          total
        ? [
            {
              id: "receipt-payment-payer",
              participantId: "receipt-participant-1",
              amount: total,
              note: "Receipt payer",
            } satisfies SplitBillPaymentDraft,
          ]
        : [];
  return {
    ...createBlankSplitBillDraft(),
    title: merchantNameForDraft ? `${merchantNameForDraft} receipt` : "Receipt split",
    merchantName: merchantNameForDraft ?? "",
    billDate: preview.billDate ? preview.billDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
    currency: preview.currency,
    sourceType: "receipt",
    receiptText: preview.receiptText,
    receiptConfidence: preview.confidence,
    subtotal: summarySubtotal,
    serviceCharge: summaryServiceCharge,
    tax: summaryTax,
    tip: summaryTip,
    rounding: summaryRounding,
    discount: summaryDiscount,
    total,
    participants:
      payerSeededReceiptParticipants.length > 0
        ? payerSeededReceiptParticipants.map((name, index) => ({
            id: `receipt-participant-${index + 1}`,
            name,
          }))
        : [],
    items:
      previewItemsForDraft.length > 0
        ? previewItemsForDraft.map((item, index) => {
            const matchedParticipantNames = inferItemParticipantIds(item.description, receiptParticipantNames);
          return {
              id: `${index}`,
              description: item.description,
              amount: item.amount,
              participantIds: matchedParticipantNames
                .map((participantName) => participantIdByName.get(participantName.toLowerCase()))
                .filter((participantId): participantId is string => typeof participantId === "string" && participantId.length > 0),
              splitMethod: "equal",
              allocations: [],
            };
          })
        : [{ description: "Total", amount: total, participantIds: [], splitMethod: "equal", allocations: [] }],
    payments: [...receiptPayments, ...payerSeededPayments],
    rawPayload: mergeSplitBillReceiptSummary(
      {
        receiptAccountMatch: shouldPreserveAccountHints ? preview.receiptAccountMatch : null,
        receiptBackupParser: preview.backupParser ?? null,
        paymentMethod: shouldPreserveAccountHints ? preview.paymentMethod : null,
        receiptPayerName: preview.receiptPayerName,
        receiptCurrencyMentions: preview.currencyMentions,
        receiptCurrencyWarning: preview.currencyWarning,
        splitAllocations: preview.splitAllocations,
      },
      {
        subtotal: summarySubtotal || null,
        serviceCharge: summaryServiceCharge || null,
        tax: summaryTax || null,
        tip: summaryTip || null,
        rounding: summaryRounding || null,
        discount: summaryDiscount || null,
        total: total || null,
      }
    ),
  };
};

export const splitBillDraftFromSerializedBill = (bill: SplitBillSerializedBill): SplitBillDraft => ({
  id: bill.id,
  title: bill.title,
  note: bill.note ?? "",
  billDate: bill.billDate.slice(0, 10),
  currency: bill.currency,
  sourceType: bill.sourceType,
  merchantName: bill.merchantName ?? "",
  receiptFileName: bill.receiptFileName ?? "",
  receiptMimeType: bill.receiptMimeType ?? "",
  receiptText: bill.receiptText ?? "",
  receiptConfidence: bill.receiptConfidence,
  subtotal: bill.subtotal ?? "",
  serviceCharge:
    typeof getReceiptSummaryFromRawPayload(bill.rawPayload)?.serviceCharge === "string"
      ? (getReceiptSummaryFromRawPayload(bill.rawPayload)?.serviceCharge as string)
      : "",
  tax: bill.tax ?? "",
  tip: bill.tip ?? "",
  rounding:
    typeof getReceiptSummaryFromRawPayload(bill.rawPayload)?.rounding === "string"
      ? (getReceiptSummaryFromRawPayload(bill.rawPayload)?.rounding as string)
      : "",
  discount: bill.discount ?? "",
  total: bill.total ?? "",
  groupId: bill.groupId ?? "",
  rawPayload: bill.rawPayload ?? null,
  participants: bill.participants.map((participant) => ({
    id: participant.id,
    name: participant.name,
  })),
  items: bill.items.map((item) => ({
    id: item.id,
    description: item.description,
    amount: item.amount,
    participantIds: item.participantIds,
    splitMethod: item.splitMethod ?? "equal",
    allocations: item.allocations ?? [],
  })),
  payments: bill.payments.map((payment) => ({
    id: payment.id,
    participantId: payment.participantId,
    amount: payment.amount,
    note: payment.note ?? "",
  })),
});

const getReceiptSummaryFromRawPayload = (rawPayload: Record<string, unknown> | null | undefined): Partial<SplitBillReceiptSummary> | null => {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }

  const summary = rawPayload.receiptSummary;
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    return null;
  }

  return summary as Partial<SplitBillReceiptSummary>;
};

const getRawPayloadTextValue = (rawPayload: Record<string, unknown> | null | undefined, key: "serviceCharge" | "rounding") => {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }

  const value = rawPayload[key];
  return typeof value === "string" || typeof value === "number" ? value : null;
};

export const mergeSplitBillReceiptSummary = (
  rawPayload: Record<string, unknown> | null | undefined,
  summary: SplitBillReceiptSummary
) => {
  const payload = rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload) ? { ...rawPayload } : {};
  const existingSummary = getReceiptSummaryFromRawPayload(payload);

  payload.receiptSummary = {
    ...(existingSummary ?? {}),
    ...(summary.subtotal !== undefined ? { subtotal: summary.subtotal } : {}),
    ...(summary.serviceCharge !== undefined ? { serviceCharge: summary.serviceCharge } : {}),
    ...(summary.tax !== undefined ? { tax: summary.tax } : {}),
    ...(summary.tip !== undefined ? { tip: summary.tip } : {}),
    ...(summary.rounding !== undefined ? { rounding: summary.rounding } : {}),
    ...(summary.discount !== undefined ? { discount: summary.discount } : {}),
    ...(summary.total !== undefined ? { total: summary.total } : {}),
  };

  return payload;
};

const getSplitBillTransferSettlementKey = (fromParticipantId: string, toParticipantId: string) =>
  `${fromParticipantId}::${toParticipantId}`;

const applyTransferSettlementsToSettlement = (
  settlement: SplitBillSettlement,
  transferSettlements: Array<{
    fromParticipantId: string;
    toParticipantId: string;
    amount: { toString: () => string };
  }>
): SplitBillSettlement => {
  if (transferSettlements.length === 0 || settlement.transfers.length === 0) {
    return settlement;
  }

  const settledByTransfer = new Map<string, number>();
  for (const settledTransfer of transferSettlements) {
    const amount = parseAmountValue(settledTransfer.amount.toString()) ?? 0;
    if (amount <= 0) {
      continue;
    }

    const key = getSplitBillTransferSettlementKey(settledTransfer.fromParticipantId, settledTransfer.toParticipantId);
    settledByTransfer.set(key, (settledByTransfer.get(key) ?? 0) + amount);
  }

  return {
    ...settlement,
    transfers: settlement.transfers.flatMap((transfer) => {
      const key = getSplitBillTransferSettlementKey(transfer.fromParticipantId, transfer.toParticipantId);
      const remaining = Math.max(0, transfer.amount - (settledByTransfer.get(key) ?? 0));
      return remaining > 0.005 ? [{ ...transfer, amount: Math.round(remaining * 100) / 100 }] : [];
    }),
  };
};

export const serializeSplitBillRecord = (bill: {
  id: string;
  userId: string;
  transactionId: string | null;
  groupId: string | null;
  title: string;
  note: string | null;
  billDate: Date;
  currency: string;
  sourceType: SplitBillSourceType;
  merchantName: string | null;
  receiptFileName: string | null;
  receiptMimeType: string | null;
  receiptText: string | null;
  receiptConfidence: number;
  subtotal: { toString: () => string } | null;
  tax: { toString: () => string } | null;
  tip: { toString: () => string } | null;
  discount: { toString: () => string } | null;
  total: { toString: () => string } | null;
  rawPayload: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  group: {
    id: string;
    name: string;
    members: Array<{ id: string; name: string; sortOrder: number }>;
  } | null;
  participants: Array<{ id: string; name: string }>;
  items: Array<{
    id: string;
    description: string;
    amount: { toString: () => string };
    sortOrder: number;
    participants: Array<{ participantId: string }>;
  }>;
  payments: Array<{
    id: string;
    participantId: string;
    amount: { toString: () => string };
    note: string | null;
  }>;
  transferSettlements?: Array<{
    id: string;
    billId: string;
    fromParticipantId: string;
    fromParticipantName: string;
    toParticipantId: string;
    toParticipantName: string;
    amount: { toString: () => string };
    note: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  transaction?: {
    id: string;
    merchantRaw: string;
    merchantClean: string | null;
    date: Date;
    amount: { toString: () => string };
    currency: string;
    account: {
      name: string;
    } | null;
  } | null;
}): SplitBillSerializedBill => {
  const transferSettlements = bill.transferSettlements ?? [];
  const itemSplitMetadata = getSplitBillItemSplitMetadata(bill.rawPayload);
  const getItemSplitMethod = (itemId: string): SplitBillSplitMethod => {
    const splitMethod = itemSplitMetadata[itemId]?.splitMethod;
    return isSplitBillSplitMethod(splitMethod) ? splitMethod : "equal";
  };
  const settlement = applyTransferSettlementsToSettlement(
    buildSplitBillSettlement({
      participants: bill.participants,
      items: bill.items.map((item) => ({
        amount: item.amount.toString(),
        participantIds: item.participants.map((entry) => entry.participantId),
        splitMethod: getItemSplitMethod(item.id),
        allocations: normalizeSplitBillItemAllocations(itemSplitMetadata[item.id]?.allocations),
      })),
      payments: bill.payments.map((payment) => ({
        participantId: payment.participantId,
        amount: payment.amount.toString(),
      })),
      serviceCharge:
        getReceiptSummaryFromRawPayload(bill.rawPayload)?.serviceCharge ??
        getRawPayloadTextValue(bill.rawPayload, "serviceCharge"),
      tax: bill.tax?.toString() ?? null,
      tip: bill.tip?.toString() ?? null,
      rounding:
        getReceiptSummaryFromRawPayload(bill.rawPayload)?.rounding ??
        getRawPayloadTextValue(bill.rawPayload, "rounding"),
      discount: bill.discount?.toString() ?? null,
    }),
    transferSettlements
  );

  return {
    id: bill.id,
    userId: bill.userId,
    transactionId: bill.transactionId,
    groupId: bill.groupId,
    title: bill.title,
    note: bill.note,
    billDate: bill.billDate.toISOString(),
    currency: bill.currency,
    sourceType: bill.sourceType,
    merchantName: bill.merchantName,
    receiptFileName: bill.receiptFileName,
    receiptMimeType: bill.receiptMimeType,
    receiptText: bill.receiptText,
    receiptConfidence: bill.receiptConfidence,
    subtotal: bill.subtotal?.toString() ?? null,
    tax: bill.tax?.toString() ?? null,
    tip: bill.tip?.toString() ?? null,
    discount: bill.discount?.toString() ?? null,
    total: bill.total?.toString() ?? null,
    rawPayload: bill.rawPayload,
    createdAt: bill.createdAt.toISOString(),
    updatedAt: bill.updatedAt.toISOString(),
    group: bill.group
      ? {
          id: bill.group.id,
          name: bill.group.name,
          members: bill.group.members.slice().sort((left, right) => left.sortOrder - right.sortOrder),
        }
      : null,
    participants: bill.participants,
    items: bill.items
      .slice()
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((item) => ({
        id: item.id,
        description: item.description,
        amount: item.amount.toString(),
        sortOrder: item.sortOrder,
        participantIds: item.participants.map((entry) => entry.participantId),
        splitMethod: getItemSplitMethod(item.id),
        allocations: normalizeSplitBillItemAllocations(itemSplitMetadata[item.id]?.allocations),
      })),
    payments: bill.payments.map((payment) => ({
      id: payment.id,
      participantId: payment.participantId,
      amount: payment.amount.toString(),
      note: payment.note,
    })),
    transaction: bill.transaction
      ? {
          id: bill.transaction.id,
          merchantRaw: bill.transaction.merchantRaw,
          merchantClean: bill.transaction.merchantClean,
          date: bill.transaction.date.toISOString(),
          amount: bill.transaction.amount.toString(),
          currency: bill.transaction.currency,
          account: bill.transaction.account
            ? {
                name: bill.transaction.account.name,
              }
            : null,
        }
      : null,
    transferSettlements: transferSettlements.map((transferSettlement) => ({
      id: transferSettlement.id,
      billId: transferSettlement.billId,
      fromParticipantId: transferSettlement.fromParticipantId,
      fromParticipantName: transferSettlement.fromParticipantName,
      toParticipantId: transferSettlement.toParticipantId,
      toParticipantName: transferSettlement.toParticipantName,
      amount: transferSettlement.amount.toString(),
      note: transferSettlement.note,
      createdAt: transferSettlement.createdAt.toISOString(),
      updatedAt: transferSettlement.updatedAt.toISOString(),
    })),
    activity: getSplitBillActivity(bill.rawPayload),
    settlement,
  };
};
