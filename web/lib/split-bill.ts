import type { Prisma } from "@prisma/client";

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

export type SplitBillItemDraft = {
  id?: string;
  description: string;
  amount: string;
  participantIds: string[];
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
  merchantName: string | null;
  billDate: string | null;
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
  }>;
  payments: Array<{
    id: string;
    participantId: string;
    amount: string;
    note: string | null;
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

  const compact = normalizeWhitespace(value).toUpperCase().replace(/[^A-Z]/g, " ");
  const token = compact.replace(/\s+/g, " ").trim();

  return CURRENCY_ALIAS[token] ?? (token.replace(/\s+/g, "").slice(0, 3) || "PHP");
};

const detectCurrencyFromText = (text: string) => {
  if (/[₱]/.test(text) || /\bPHP\b/i.test(text)) {
    return "PHP";
  }

  if (/\$/.test(text) || /\bUSD\b/i.test(text)) {
    return "USD";
  }

  if (/€/.test(text) || /\bEUR\b/i.test(text)) {
    return "EUR";
  }

  if (/£/.test(text) || /\bGBP\b/i.test(text)) {
    return "GBP";
  }

  if (/¥/.test(text) || /\bJPY\b/i.test(text)) {
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

  if (/[₱]/.test(text) || /\bPHP\b/i.test(text)) {
    pushMention("PHP");
  }
  if (/\$/.test(text) || /\bUSD\b/i.test(text)) {
    pushMention("USD");
  }
  if (/€/.test(text) || /\bEUR\b/i.test(text)) {
    pushMention("EUR");
  }
  if (/£/.test(text) || /\bGBP\b/i.test(text)) {
    pushMention("GBP");
  }
  if (/¥/.test(text) || /\bJPY\b/i.test(text)) {
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

const parseBillDateFromText = (text: string) => {
  const datePatterns = [
    /\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/,
    /\b(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\b/,
    /\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})\b/,
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (!match) {
      continue;
    }

    if (match[1].length === 4) {
      const year = Number(match[1]);
      const month = Number(match[2]) - 1;
      const day = Number(match[3]);
      const parsed = new Date(Date.UTC(year, month, day));
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    } else if (/^[A-Za-z]/.test(match[1])) {
      const parsed = new Date(`${match[1]} ${match[2]}, ${match[3]}`);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    } else {
      const first = Number(match[1]);
      const second = Number(match[2]);
      const year = match[3].length === 2 ? Number(`20${match[3]}`) : Number(match[3]);
      const parsed = new Date(Date.UTC(year, first > 12 ? second - 1 : first - 1, first > 12 ? first : second));
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }
  }

  return null;
};

const isSummaryLine = (line: string) =>
  /^[+\-*•]?\s*(subtotal|sub total|tax|vat|service charge|discount|tip|tips?|round\s*off|rounding|amount due|balance due|grand total|total)\b/i.test(
    line
  );

const isNoiseLine = (line: string) =>
  /^(thank you|powered by|receipt|order|invoice|official receipt|or no\.?|cashier|store copy|customer copy|page \d+|paid with|paid via|payment method|tendered with|charged to|refund|void|voided|reversal)/i.test(
    line
  );

const isReceiptDateLine = (line: string) =>
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i.test(line) &&
  /\b\d{1,2}(?:st|nd|rd|th)?\b/.test(line) &&
  /\b\d{2,4}\b/.test(line);

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
  const matches = Array.from(compact.matchAll(/-?\(?[\d,.]+(?:\.\d{1,2})?\)?/g));
  if (matches.length === 0) {
    return null;
  }

  const amountToken =
    [...matches]
      .reverse()
      .map((match) => match[0] ?? null)
      .find((token) => token !== null && (/\.\d{1,2}$/.test(token) || /^\d{3,}$/.test(token))) ?? null;
  return parseAmountValue(amountToken);
};

const isLikelyReceiptBodyLine = (line: string) => {
  if (!line || isSummaryLine(line) || isNoiseLine(line)) {
    return false;
  }

  if (parseAmountFromLine(line) !== null) {
    return true;
  }

  return /[A-Za-z]/.test(line) && line.length <= 80;
};

const cleanReceiptDescription = (line: string) =>
  normalizeWhitespace(line)
    .replace(/\s+\d{1,3}(?:[.,]\d{2})?$/, "")
    .replace(/\s+\d+x\s*$/i, "")
    .replace(/\b\d{1,3}\s*x\s*/i, "")
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
    /(?:^\s*qty\s+description\b|^\s*vat\s+item\(s\)\b|^\s*item\(s\)\b)/i.test(normalizeWhitespace(line))
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

      if (parseAmountFromLine(line) !== null) {
        return null;
      }

      const cleaned = cleanReceiptDescription(line);
      if (!cleaned || cleaned.length < 3 || cleaned.length > 60 || !/[A-Za-z]{3}/.test(cleaned)) {
        return null;
      }

      let score = 0;
      const alphaCount = (cleaned.match(/[A-Za-z]/g) ?? []).length;
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
      if (/^(?:qty|description|dine in|vat item|cashier|server|guest count|invoice|sub\s*-?\s*total|service charge|amount due|total no of items|vat sales|temporary bill)\b/i.test(cleaned)) {
        score -= 20;
      }

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
  const normalized = cleanReceiptDescription(value).replace(/^[^A-Za-z0-9]+/, "");
  if (!normalized) {
    return null;
  }

  const parts = normalized.split(/\s+/).filter(Boolean);
  while (parts.length > 1 && parts[0].length <= 2 && /^[A-Za-z]+$/.test(parts[0])) {
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
  if (!description || description.length < 2) {
    return null;
  }

  const unitPrice = amount !== null && Number.isFinite(quantity) && quantity > 0 ? amount / quantity : null;

  return {
    description,
    amount: amount !== null ? amount.toFixed(2) : null,
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

    const item = parseReceiptTableItemLine(normalized);
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

const inferReceiptSubtotalFromFooter = (lines: string[]) => {
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
    return null;
  }

  const subtotal = footerAmounts.reduce((sum, amount) => sum + amount, 0);
  return Number.isFinite(subtotal) && subtotal > 0 ? subtotal : null;
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

    if (isSummaryLine(line) || isNoiseLine(line)) {
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

  const accountSignals: Array<{ pattern: RegExp; accountName: string; confidence: number }> = [
    { pattern: /\b(?:visa|vsa)\b/i, accountName: "Visa", confidence: 80 },
    { pattern: /\bmaster\s*card\b|\bmastercard\b/i, accountName: "Mastercard", confidence: 80 },
    { pattern: /\bamex\b|\bamerican express\b/i, accountName: "American Express", confidence: 80 },
    { pattern: /\bdebit card\b/i, accountName: "Debit Card", confidence: 72 },
    { pattern: /\bcredit card\b/i, accountName: "Credit Card", confidence: 72 },
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
  const billDate = parseBillDateFromText(normalized);
  const tableBounds = findReceiptTableBounds(lines);
  const merchantName =
    sanitizeReceiptMerchantName(detectReceiptMerchantNameFromLines(tableBounds ? lines.slice(0, tableBounds.startIndex) : lines) ?? "") ??
    lines.find((line) => line.length > 2 && !isSummaryLine(line) && !isNoiseLine(line) && parseAmountFromLine(line) === null) ??
    null;

  const subtotalLine = lines.find((line) => /^[+\-*•]?\s*sub\s*total\b/i.test(line));
  const serviceChargeLine = lines.find((line) => /\bcharge\b/i.test(line) && parseAmountFromLine(line) !== null);
  const taxLine = lines.find((line) => /^[+\-*•]?\s*(tax|vat)\b/i.test(line));
  const tipLine = lines.find((line) => /^[+\-*•]?\s*tip\b/i.test(line));
  const roundingLine = lines.find((line) => /^[+\-*•]?\s*(round\s*off|rounding)\b/i.test(line));
  const discountLine = lines.find((line) => /^[+\-*•]?\s*discount\b/i.test(line));
  const totalLine = [...lines].reverse().find((line) => /^[+\-*•]?\s*(amount due|grand total|total)\b/i.test(line));
  const subtotal = subtotalLine ? parseAmountFromLine(subtotalLine) : inferReceiptSubtotalFromFooter(lines);
  const serviceCharge = serviceChargeLine ? parseAmountFromLine(serviceChargeLine) : null;
  const tax = taxLine ? parseAmountFromLine(taxLine) : null;
  const tip = tipLine ? parseAmountFromLine(tipLine) : null;
  const rounding = roundingLine ? parseAmountFromLine(roundingLine) : null;
  const discount = discountLine ? parseAmountFromLine(discountLine) : null;
  const tableItems = extractReceiptTableItems(lines, merchantName);
  const items = repairReceiptItemsWithSubtotal(tableItems.length > 0 ? tableItems : itemCandidatesFromText(lines, merchantName), subtotal);
  const total =
    totalLine && parseAmountFromLine(totalLine) !== null
      ? parseAmountFromLine(totalLine)
      : subtotal !== null
        ? subtotal + (serviceCharge ?? 0) + (tax ?? 0) + (tip ?? 0) + (rounding ?? 0) - (discount ?? 0)
        : items.reduce((sum, item) => sum + (parseAmountValue(item.amount) ?? 0), 0) || null;
  const { allocations, participants } = splitAllocationsFromText(lines, currency, total !== null ? total.toFixed(2) : null);
  const receiptAccountMatch = detectReceiptAccountMatchFromText(normalized);
  const paymentMethod = detectReceiptPaymentMethodFromText(lines, receiptAccountMatch);
  const receiptPayerName = detectReceiptPayerNameFromText(lines);

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

  const confidence = Math.max(
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
        (currencyWarning ? 6 : 0)
    )
  );

  return {
    receiptText: normalized.trim(),
    merchantName,
    billDate,
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
    confidence,
  };
};

export const buildSplitBillSettlement = (params: {
  participants: Array<{ id: string; name: string }>;
  items: Array<{
    amount: string | number;
    participantIds: string[];
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
  items: [{ description: "Total", amount: "", participantIds: [] }],
  payments: [],
  rawPayload: null,
});

export const splitBillDraftFromReceiptPreview = (preview: ReceiptPreviewResult): SplitBillDraft => {
  const total = preview.total ?? "";
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
    title: preview.merchantName ? `${preview.merchantName} receipt` : "Receipt split",
    merchantName: preview.merchantName ?? "",
    billDate: preview.billDate ? preview.billDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
    currency: preview.currency,
    sourceType: "receipt",
    receiptText: preview.receiptText,
    receiptConfidence: preview.confidence,
    subtotal: preview.subtotal ?? "",
    serviceCharge: preview.serviceCharge ?? "",
    tax: preview.tax ?? "",
    tip: preview.tip ?? "",
    rounding: preview.rounding ?? "",
    discount: preview.discount ?? "",
    total,
    participants:
      payerSeededReceiptParticipants.length > 0
        ? payerSeededReceiptParticipants.map((name, index) => ({
            id: `receipt-participant-${index + 1}`,
            name,
          }))
        : [],
    items:
      preview.items.length > 0
        ? preview.items.map((item, index) => {
            const matchedParticipantNames = inferItemParticipantIds(item.description, receiptParticipantNames);
            return {
              id: `${index}`,
              description: item.description,
              amount: item.amount,
              participantIds: matchedParticipantNames
                .map((participantName) => participantIdByName.get(participantName.toLowerCase()))
                .filter((participantId): participantId is string => typeof participantId === "string" && participantId.length > 0),
            };
          })
        : [{ description: "Total", amount: total, participantIds: [] }],
    payments: [...receiptPayments, ...payerSeededPayments],
    rawPayload: mergeSplitBillReceiptSummary(
      {
        receiptAccountMatch: preview.receiptAccountMatch,
        paymentMethod: preview.paymentMethod,
        receiptPayerName: preview.receiptPayerName,
        receiptCurrencyMentions: preview.currencyMentions,
        receiptCurrencyWarning: preview.currencyWarning,
        splitAllocations: preview.splitAllocations,
      },
      {
        subtotal: preview.subtotal,
        serviceCharge: preview.serviceCharge,
        tax: preview.tax,
        tip: preview.tip,
        rounding: preview.rounding,
        discount: preview.discount,
        total: preview.total,
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

export const serializeSplitBillRecord = (bill: {
  id: string;
  userId: string;
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
}): SplitBillSerializedBill => {
  const settlement = buildSplitBillSettlement({
    participants: bill.participants,
    items: bill.items.map((item) => ({
      amount: item.amount.toString(),
      participantIds: item.participants.map((entry) => entry.participantId),
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
  });

  return {
    id: bill.id,
    userId: bill.userId,
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
      })),
    payments: bill.payments.map((payment) => ({
      id: payment.id,
      participantId: payment.participantId,
      amount: payment.amount.toString(),
      note: payment.note,
    })),
    settlement,
  };
};
