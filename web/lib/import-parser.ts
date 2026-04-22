import type { TransactionType } from "@prisma/client";

export type ImportedAccountType = "bank" | "wallet" | "credit_card" | "cash" | "investment" | "other";

export type ParsedImportRow = {
  date?: string;
  amount?: string;
  merchantRaw?: string;
  merchantClean?: string;
  description?: string;
  categoryName?: string;
  accountName?: string;
  institution?: string | null;
  type?: TransactionType;
  rawPayload?: Record<string, unknown>;
  learnedRuleIdsApplied?: string[];
};

export type DetectedStatementMetadata = {
  institution: string | null;
  accountNumber: string | null;
  accountName: string | null;
  openingBalance: number | null;
  endingBalance: number | null;
  startDate: string | null;
  endDate: string | null;
};

const delimiterForFile = (fileType: string, fileName: string) => {
  const lower = `${fileType} ${fileName}`.toLowerCase();
  if (lower.includes("tsv")) return "\t";
  return ",";
};

const guessCategoryName = (text: string, type: TransactionType) => {
  const lower = text.toLowerCase();
  const compact = compactWhitespace(text).toLowerCase();
  if (/taxwithheld|withheldtax|tax withheld|withheld tax/.test(lower) || /taxwithheld|withheldtax/.test(compact)) return "Financial";
  if (/instapay\s*transfer\s*fee|instapaytransferfee/.test(lower) || /instapaytransferfee/.test(compact)) return "Transfers";
  if (type === "income" || /salary|payroll|income|deposit|credit memo/.test(lower)) return "Income";
  if (/transfer|instapay|pesonet|wise to|to savings|to checking/.test(lower)) return "Transfers";
  if (/grocery|supermarket|market|food|dining|restaurant|coffee|cafe|meal|takeout|starbucks|donut|foodhall|mister donut/.test(lower)) return "Food & Dining";
  if (/auntie\s*annes|llaollao/.test(lower)) return "Food & Dining";
  if (/grab|uber|taxi|bus|train|mrt|mrt3|dotr|parking|gas|fuel|transport|ride/.test(lower)) return "Transport";
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
  if (/\bfee\b|interest|loan|financial|bank charge/.test(lower)) return "Financial";
  return "Other";
};

export const inferAccountTypeFromStatement = (
  institution?: string | null,
  accountName?: string | null,
  fallback: ImportedAccountType = "bank"
): ImportedAccountType => {
  const normalized = `${institution ?? ""} ${accountName ?? ""}`.toLowerCase();

  if (/(gcash|maya|wallet)/.test(normalized)) {
    return "wallet";
  }

  if (/(rcbc|bankard|credit card|visa platinum|mastercard|amex|card ending)/.test(normalized)) {
    return "credit_card";
  }

  if (/(invest|investment|broker|stocks?|fund)/.test(normalized)) {
    return "investment";
  }

  if (/\bcash\b/.test(normalized)) {
    return "cash";
  }

  return fallback;
};

const splitLine = (line: string, delimiter: string) => {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
};

const normalizeWhitespace = (value: string) => value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

const formatUnionBankAccountName = (accountNumber?: string | null) => {
  const suffix = accountNumber?.slice(-4) ?? "";
  return suffix ? `UnionBank ${suffix}` : "UnionBank";
};

const normalizeBpiText = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => {
      const normalized = normalizeWhitespace(line);
      if (!normalized) {
        return normalized;
      }

      const tokens = normalized.split(" ");
      const singleCharacterTokens = tokens.filter((token) => /^[A-Za-z0-9]$/.test(token)).length;
      const looksCharacterSpaced = tokens.length >= 6 && singleCharacterTokens / tokens.length >= 0.65;
      return looksCharacterSpaced ? tokens.join("") : normalized;
    })
    .join("\n");

const compactWhitespace = (value: string) => normalizeWhitespace(value).replace(/\s+/g, "");

const humanizeMerchantText = (value: string) => {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return "";
  }

  const replacements: Array<[RegExp, string]> = [
    [/fundtransfer/gi, "Fund Transfer"],
    [/interestearned/gi, "Interest Earned"],
    [/taxwithheld/gi, "Tax Withheld"],
    [/instapaytransferfee/gi, "InstaPay Transfer Fee"],
    [/transfertootherbank/gi, "Transfer to Other Bank"],
    [/transferto/gi, "Transfer to"],
    [/transferfrom/gi, "Transfer from"],
  ];

  let next = normalized;
  for (const [pattern, replacement] of replacements) {
    next = next.replace(pattern, replacement);
  }

  next = next
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .replace(/\s*:\s*/g, ": ")
    .replace(/\s+/g, " ")
    .trim();

  return next;
};

const summarizeMerchantText = (value: string) => {
  const humanized = humanizeMerchantText(value);
  const compact = humanized.replace(/[^a-z0-9]+/gi, "").toLowerCase();

  if (!humanized) {
    return humanized;
  }

  if (compact.includes("fundtransfer")) {
    return "Fund Transfer";
  }

  if (compact.includes("interestearned")) {
    return "Interest Earned";
  }

  if (compact.includes("taxwithheld")) {
    return "Tax Withheld";
  }

  if (compact.includes("instapaytransferfee")) {
    return "InstaPay Transfer Fee";
  }

  if (compact.includes("transfertootherbank")) {
    return "Transfer to Other Bank";
  }

  if (/^(cash in|cash out|payment to|received|sent|transfer to|transfer from)\b/i.test(humanized)) {
    return humanized.split(/\s+/).slice(0, 3).join(" ");
  }

  return humanized;
};

const MAX_DECIMAL_AMOUNT = 9_999_999_999_999_999.99;

const parseMoney = (value?: string | null) => {
  if (!value) return null;
  const cleaned = String(value).replace(/[^0-9.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === "." || cleaned === "-.") {
    return null;
  }

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || Math.abs(parsed) > MAX_DECIMAL_AMOUNT) {
    return null;
  }

  return parsed;
};

const institutionPatterns: Array<{ name: string; pattern: RegExp }> = [
  { name: "BPI", pattern: /\b(BANK OF THE PHILIPPINE ISLANDS|BPI)\b/i },
  { name: "BDO", pattern: /\b(BDO|BANCO DE ORO)\b/i },
  { name: "Metrobank", pattern: /\b(METROBANK|METROPOLITAN BANK)\b/i },
  { name: "Security Bank", pattern: /\bSECURITY BANK\b/i },
  { name: "EastWest", pattern: /\b(EASTWEST|EAST WEST)\b/i },
  { name: "RCBC", pattern: /\bRCBC\b/i },
  { name: "UnionBank", pattern: /\bUNIONBANK\b/i },
  { name: "Landbank", pattern: /\bLANDBANK\b/i },
  { name: "Chinabank", pattern: /\bCHINABANK\b/i },
  { name: "Maya", pattern: /\bMAYA\b/i },
  { name: "GCash", pattern: /\bGCASH\b/i },
  { name: "Wise", pattern: /\bWISE\b/i },
  { name: "PayPal", pattern: /\bPAYPAL\b/i },
];

const detectInstitutionFromText = (text: string) => {
  for (const institution of institutionPatterns) {
    if (institution.pattern.test(text)) {
      return institution.name;
    }
  }

  return null;
};

const detectAccountNumberFromText = (text: string) => {
  const labeledAccountSection =
    text.match(/\b(?:ACCOUNT\s*(?:NO|NUMBER|#)?|ACCT\s*(?:NO|NUMBER|#)?|A\/C\s*(?:NO|NUMBER|#)?|CARD\s*(?:NO|NUMBER|#)?|NO)\s*[:\-]?\s*([0-9\s-]{6,})/i)?.[1] ??
    "";
  const fallbackAccountSection = text.match(/\b\d{4}[-\s]?\d{4}[-\s]?\d{2,4}\b/)?.[0] ?? "";
  const accountSection = labeledAccountSection || fallbackAccountSection;
  const accountNumber = accountSection.replace(/\D/g, "").slice(0, 16) || null;
  return accountNumber;
};

const detectStatementDatesFromText = (text: string) => {
  const rangeMatch =
    text.match(/(?:STATEMENT\s*PERIOD|PERIOD\s*COVERED|FROM)\s*[:\-]?\s*(.+?)\s*(?:TO|THRU|THROUGH|[-–—])\s*(.+?)(?:\s{2,}|$)/i) ??
    text.match(/(?:START\s*DATE|BEGINNING\s*DATE)\s*[:\-]?\s*(.+?)\s*(?:END\s*DATE|ENDING\s*DATE)\s*[:\-]?\s*(.+?)(?:\s{2,}|$)/i);

  const parseLooseDate = (value?: string | null) => {
    if (!value) return null;
    const normalized = value.replace(/\s+/g, " ").trim();
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  return {
    startDate: parseLooseDate(rangeMatch?.[1]),
    endDate: parseLooseDate(rangeMatch?.[2]),
  };
};

const detectBalanceFromText = (text: string) => {
  const openingBalance =
    parseMoney(text.match(/(?:BEGINNING|OPENING|STARTING)\s+BALANCE\s*[:\-]?\s*([0-9,]+\.\d{2})/i)?.[1]) ??
    null;
  const endingBalance =
    parseMoney(text.match(/(?:ENDING|CLOSING|BALANCE\s+THIS\s+STATEMENT)\s*[:\-]?\s*([0-9,]+\.\d{2})/i)?.[1]) ??
    null;

  return {
    openingBalance,
    endingBalance,
  };
};

const parseBpiDate = (value?: string | null) => {
  if (!value) return null;
  const normalized = normalizeWhitespace(value);
  const compact = compactWhitespace(normalized);
  const match = compact.match(/^([A-Z]{3})(\d{1,2}),(\d{4})$/i);
  if (!match) {
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const monthIndex = monthIndexByAbbr[match[1].slice(0, 3).toUpperCase()];
  if (monthIndex === undefined) {
    return null;
  }

  return new Date(Date.UTC(Number(match[3]), monthIndex, Number(match[2]), 12));
};

const parseRcbcDate = (value?: string | null) => {
  if (!value) return null;

  const normalized = normalizeWhitespace(value);
  const monthDayYearMatch = normalized.match(/^([A-Z]{3})\s+(\d{1,2})\s+(\d{4})$/i);
  if (monthDayYearMatch) {
    const monthIndex = monthIndexByAbbr[monthDayYearMatch[1].slice(0, 3).toUpperCase()];
    if (monthIndex === undefined) {
      return null;
    }

    return new Date(Date.UTC(Number(monthDayYearMatch[3]), monthIndex, Number(monthDayYearMatch[2]), 12));
  }

  const slashDateMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashDateMatch) {
    const month = Number(slashDateMatch[1]) - 1;
    const day = Number(slashDateMatch[2]);
    const year = Number(slashDateMatch[3].length === 2 ? `20${slashDateMatch[3]}` : slashDateMatch[3]);
    return new Date(Date.UTC(year, month, day, 12));
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const rcbcStatementMetadata = (text: string): DetectedStatementMetadata | null => {
  const normalized = text.replace(/\u00a0/g, " ");
  const compact = normalizeWhitespace(normalized);
  if (!/\bRCBC\b|\bRCBC BANKARD\b|\bBANKARD\b|\bVISA PLATINUM\b/i.test(compact)) {
    return null;
  }

  const lines = normalized
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  const cardMatch =
    lines
      .map((line) => line.match(/\b(\d{4}[-\s]\d{4}[-\s]\d{4}[-\s]\d{4})\b/))
      .find((match) => Boolean(match?.[1])) ??
    compact.match(/\b(\d{4}[-\s]\d{4}[-\s]\d{4}[-\s]\d{4})\b/);
  const accountNumber = cardMatch?.[1] ? cardMatch[1].replace(/\D/g, "") : null;
  const accountName = accountNumber ? `RCBC ${accountNumber.slice(-4)}` : "RCBC";

  const dateLine =
    lines.find((line) => /STATEMENT\s+DATE\s+PAYMENT\s+DUE\s+DATE/i.test(line)) ??
    compact;
  const dateMatch =
    dateLine.match(/([A-Z]{3}\s+\d{1,2}\s+\d{4})\s+([A-Z]{3}\s+\d{1,2}\s+\d{4})/i) ??
    compact.match(/([A-Z]{3}\s+\d{1,2}\s+\d{4})\s+([A-Z]{3}\s+\d{1,2}\s+\d{4})/i);
  const startDate = parseRcbcDate(dateMatch?.[1] ?? null);
  const endDate = parseRcbcDate(dateMatch?.[2] ?? null);

  let openingBalance: number | null = null;
  let endingBalance: number | null = null;
  const summaryIndex = lines.findIndex((line) => /PREVIOUS\s+BALANCE.*TOTAL\s+BALANCE\s+DUE/i.test(line));
  if (summaryIndex >= 0 && lines[summaryIndex + 1]) {
    const values = lines[summaryIndex + 1].match(/[0-9][0-9,]*\.\d{2}/g) ?? [];
    openingBalance = parseMoney(values[0] ?? null);
    endingBalance = parseMoney(values.at(-1) ?? null);
  }

  return {
    institution: "RCBC",
    accountNumber,
    accountName,
    openingBalance,
    endingBalance,
    startDate: startDate ? startDate.toISOString() : null,
    endDate: endDate ? endDate.toISOString() : null,
  };
};

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

const bpiStatementMetadata = (text: string): DetectedStatementMetadata | null => {
  const normalized = normalizeBpiText(text).trim();
  if (!/BANK OF THE PHILIPPINE ISLANDS|\bBPI\b|FORBES\s*PARK\s*SAVINGS\s*BET\-?PHP/i.test(normalized)) {
    return null;
  }

  const lines = normalized
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
  const headerLine =
    lines.find((line) => /PERIOD\s*COVERED/i.test(line)) ??
    lines.find((line) => /FORBES\s*PARK\s*SAVINGS/i.test(line)) ??
    normalized;
  const headerCompact = compactWhitespace(headerLine);
  const accountSection =
    headerCompact.match(/(?:PERIODCOVERED.*?NO|ACCOUNT(?:NO|NUMBER|#)|ACCT(?:NO|NUMBER|#)|A\/C(?:NO|NUMBER|#)|NO):?([0-9-]{8,})/i)?.[1] ??
    headerCompact.match(/NO:([0-9-]{8,})/i)?.[1] ??
    "";
  const accountNumber = accountSection.replace(/\D/g, "").slice(0, 10) || null;
  const accountName = accountNumber ? `BPI ${accountNumber.slice(-4)}` : "BPI";

  const periodMatch =
    headerCompact.match(/PERIODCOVERED(?:.*?)([A-Z]{3}\d{1,2},\d{4})-([A-Z]{3}\d{1,2},\d{4})/i) ??
    normalized.match(/PERIOD\s*COVERED\s+([A-Z]{3}\s+\d{1,2},\s+\d{4})\s*-\s*([A-Z]{3}\s+\d{1,2},\s+\d{4})/i);
  const startDate = parseBpiDate(periodMatch?.[1] ?? null);
  const endDate = parseBpiDate(periodMatch?.[2] ?? null);

  const openingLine = lines.find((line) => /BEGINNING\s*BALANCE/i.test(line)) ?? normalized;
  const openingCompact = compactWhitespace(openingLine);
  const openingBalance =
    parseMoney(openingCompact.match(/BEGINNINGBALANCE([0-9,]+\.\d{2})/i)?.[1]) ??
    parseMoney(openingLine.match(/BEGINNING\s+BALANCE\s+([0-9,]+\.\d{2})/i)?.[1]) ??
    parseMoney(normalized.match(/BEGINNING\s+BALANCE\s+([0-9,]+\.\d{2})/i)?.[1]);
  const endingLine = lines.find((line) => /BALANCE\s+THIS\s+STATEMENT|ENDING\s+BALANCE/i.test(line)) ?? normalized;
  const endingCompact = compactWhitespace(endingLine);
  const endingBalance =
    parseMoney(endingCompact.match(/BALANCETHISSTATEMENT([0-9,]+\.\d{2})/i)?.[1]) ??
    parseMoney(endingCompact.match(/ENDINGBALANCE([0-9,]+\.\d{2})/i)?.[1]) ??
    parseMoney(endingLine.match(/BALANCE\s+THIS\s+STATEMENT\s+([0-9,]+\.\d{2})/i)?.[1]) ??
    parseMoney(endingLine.match(/ENDING\s+BALANCE\s+([0-9,]+\.\d{2})/i)?.[1]) ??
    parseMoney(normalized.match(/BALANCE\s+THIS\s+STATEMENT\s+([0-9,]+\.\d{2})/i)?.[1]) ??
    parseMoney(normalized.match(/ENDING\s+BALANCE\s+([0-9,]+\.\d{2})/i)?.[1]);

  return {
    institution: "BPI",
    accountNumber,
    accountName,
    openingBalance,
    endingBalance,
    startDate: startDate ? startDate.toISOString() : null,
    endDate: endDate ? endDate.toISOString() : null,
  };
};

const guessRcbcCategoryName = (description: string, type: TransactionType) => {
  const lower = description.toLowerCase();
  if (/^cash payment$/i.test(description) || /cash payment|payment to card|card payment/.test(lower)) return "Transfers";
  if (/transfer|instapay|pesonet/.test(lower)) return "Transfers";
  if (/interest|\bfee\b|charge|finance charge|late charge|cash advance/.test(lower)) return "Financial";
  if (/bills payment|utility|bill|payment/.test(lower)) return "Bills & Utilities";
  if (/salary|payroll|credit memo|refund|reversal/.test(lower) && type !== "expense") return "Income";
  return guessCategoryName(description, type);
};

const parseRcbcTransactionLine = (
  line: string,
  state: {
    accountName: string;
    cardNumber: string | null;
  }
) => {
  const normalized = normalizeWhitespace(line);
  const match = normalized.match(/^(\d{2}\/\d{2}\/\d{2})\s+(\d{2}\/\d{2}\/\d{2})\s+(.+?)\s+([0-9][0-9,]*\.\d{2}-?)$/);
  if (!match) {
    return null;
  }

  const saleDate = parseDateValue(match[1]);
  const postDate = parseDateValue(match[2]);
  const description = normalizeWhitespace(match[3]);
  const amountText = match[4];
  const amount = parseMoney(amountText);
  if (!saleDate || amount === null) {
    return null;
  }

  const type: TransactionType = /cash payment|payment to card|card payment/i.test(description)
    ? "transfer"
    : /refund|reversal|credit memo/i.test(description)
      ? "income"
      : "expense";

  const categoryName = guessRcbcCategoryName(description, type);
  return {
    date: saleDate.toISOString().slice(0, 10),
    amount: amount.toFixed(2),
    merchantRaw: humanizeMerchantText(description),
    merchantClean: summarizeMerchantText(description),
    description,
    categoryName,
    accountName: state.accountName,
    type,
    rawPayload: {
      bank: "RCBC",
      cardNumber: state.cardNumber,
      saleDate: saleDate.toISOString().slice(0, 10),
      postDate: postDate ? postDate.toISOString().slice(0, 10) : null,
      amountText,
      line: normalized,
    },
  } satisfies ParsedImportRow;
};

const parseRcbcImportText = (text: string) => {
  const normalizedText = text.replace(/\u00a0/g, " ");
  const metadata = rcbcStatementMetadata(normalizedText);
  if (!metadata) {
    return null;
  }

  const lines = normalizedText
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  const headerIndex = lines.findIndex((line) => /SALE\s+DATE\s+POST\s+DATE\s+DESCRIPTION\s+AMOUNT/i.test(line));
  if (headerIndex < 0) {
    return {
      metadata,
      rows: [],
    };
  }

  const endIndexCandidates = [
    lines.findIndex((line, index) => index > headerIndex && /BALANCE\s+END/i.test(line)),
    lines.findIndex((line, index) => index > headerIndex && /\*\*\*\s*END OF STATEMENT/i.test(line)),
    lines.findIndex((line, index) => index > headerIndex && /PAGE\s+3\s+of/i.test(line)),
  ].filter((index) => index >= 0);

  const endIndex = endIndexCandidates.length > 0 ? Math.min(...endIndexCandidates) : lines.length;
  const rows: ParsedImportRow[] = [];

  for (const line of lines.slice(headerIndex + 1, endIndex)) {
    if (
      !line ||
      /IMPORTANT REMINDERS/i.test(line) ||
      /PREVIOUS\s+STATEMENT\s+BALANCE/i.test(line) ||
      /BALANCE\s+END/i.test(line) ||
      /PAGE\s+\d+\s+of\s+\d+/i.test(line) ||
      /TOTAL\s+BALANCE\s+DUE/i.test(line) ||
      /^([A-Z]{3,4})\s+[0-9,]+\.\d{2}$/.test(line)
    ) {
      continue;
    }

    const parsed = parseRcbcTransactionLine(line, {
      accountName: metadata.accountName ?? "RCBC",
      cardNumber: metadata.accountNumber,
    });

    if (parsed) {
      rows.push(parsed);
    }
  }

  return {
    metadata,
    rows,
  };
};

const gcashStatementMetadata = (text: string): DetectedStatementMetadata | null => {
  const normalized = text.replace(/\u00a0/g, " ");
  const compact = normalizeWhitespace(normalized);
  if (!/\bGCASH\b/i.test(compact)) {
    return null;
  }

  const phoneMatches = Array.from(compact.matchAll(/\b09\d{9}\b/g), (match) => match[0]);
  const phoneCounts = new Map<string, number>();
  for (const phone of phoneMatches) {
    phoneCounts.set(phone, (phoneCounts.get(phone) ?? 0) + 1);
  }

  let accountNumber: string | null = null;
  let bestCount = 0;
  for (const [phone, count] of phoneCounts.entries()) {
    if (count > bestCount) {
      accountNumber = phone;
      bestCount = count;
    }
  }

  const dateRangeMatch =
    compact.match(/(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})/i) ??
    compact.match(/(\d{4}\/\d{2}\/\d{2})\s+to\s+(\d{4}\/\d{2}\/\d{2})/i);
  const parseLooseDate = (value?: string | null) => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const openingBalance =
    parseMoney(compact.match(/STARTING\s+BALANCE\s*[:\-]?\s*([0-9,]+\.\d{2})/i)?.[1]) ??
    parseMoney(compact.match(/BEGINNING\s+BALANCE\s*[:\-]?\s*([0-9,]+\.\d{2})/i)?.[1]) ??
    null;

  return {
    institution: "GCash",
    accountNumber,
    accountName: accountNumber ? `GCash ${accountNumber.slice(-4)}` : "GCash",
    openingBalance,
    endingBalance: null,
    startDate: parseLooseDate(dateRangeMatch?.[1] ?? null)?.toISOString() ?? null,
    endDate: parseLooseDate(dateRangeMatch?.[2] ?? null)?.toISOString() ?? null,
  };
};

const normalizeGcashMerchant = (description: string) => {
  const trimmed = normalizeWhitespace(description);

  const billsPaymentMatch = trimmed.match(/^Bills Payment to\s+(.+)$/i);
  if (billsPaymentMatch?.[1]) {
    return "Bills Payment";
  }

  const receivedMatch = trimmed.match(/^Received GCash from\s+(.+?)(?:\s+with account ending in|\s+and invno:|$)/i);
  if (receivedMatch?.[1]) {
    return normalizeWhitespace(receivedMatch[1].replace(/\s*\/\s*GCash Family Savings Bank.*$/i, ""));
  }

  const sentMatch = trimmed.match(/^Sent GCash to\s+(.+?)(?:\s+with account ending in|\s+and invno:|$)/i);
  if (sentMatch?.[1]) {
    return normalizeWhitespace(sentMatch[1]);
  }

  const transferMatch = trimmed.match(/^Transfer from\s+\d+\s+to\s+\d+/i);
  if (transferMatch) {
    return "GCash Transfer";
  }

  const paymentMatch = trimmed.match(/^Payment to\s+(.+)$/i);
  if (paymentMatch?.[1]) {
    return normalizeWhitespace(paymentMatch[1]);
  }

  return trimmed;
};

const guessGcashCategoryName = (description: string, type: TransactionType) => {
  const merchant = normalizeGcashMerchant(description);
  if (type === "transfer") {
    return "Transfers";
  }

  return guessCategoryName(merchant, type);
};

const parseGcashTransactionRecord = (record: string) => {
  const normalized = normalizeWhitespace(record);
  const match = normalized.match(
    /^(?<date>\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s+(?<body>.+?)\s+(?<reference>\d{10,})\s+(?<amount>\d[\d,]*\.\d{2})\s+(?<balance>\d[\d,]*\.\d{2})$/
  );

  if (!match?.groups) {
    return null;
  }

  const description = normalizeWhitespace(match.groups.body);
  const merchantClean = normalizeGcashMerchant(description);
  const type: TransactionType =
    /^Received GCash from/i.test(description) ||
    /^Sent GCash to/i.test(description) ||
    /^Transfer from/i.test(description) ||
    /^Transfer to/i.test(description) ||
    /^Cash In/i.test(description) ||
    /^Cash Out/i.test(description) ||
    /^Add Money/i.test(description) ||
    /^Send Money/i.test(description) ||
    /^Received Money/i.test(description) ||
    /^(?:Payment to)\s+.*(?:bank|capital|securities|exchange|pdax|bancnet|loan|wallet)/i.test(description)
      ? "transfer"
      : /refund|reversal|cashback|reward|interest/i.test(description)
        ? "income"
        : "expense";

  const categoryName = guessGcashCategoryName(description, type);
  const date = parseDateValue(match.groups.date);
  const amount = parseMoney(match.groups.amount);

  if (!date || amount === null) {
    return null;
  }

  return {
    date: date.toISOString().slice(0, 10),
    amount: amount.toFixed(2),
    merchantRaw: humanizeMerchantText(description),
    merchantClean: summarizeMerchantText(merchantClean),
    description,
    categoryName,
    type,
    rawPayload: {
      bank: "GCash",
      referenceNo: match.groups.reference,
      amountText: match.groups.amount,
      balanceText: match.groups.balance,
      balance: parseMoney(match.groups.balance),
      line: normalized,
    },
  } satisfies ParsedImportRow;
};

const parseGcashImportText = (text: string) => {
  const metadata = gcashStatementMetadata(text);
  if (!metadata) {
    return null;
  }

  const lines = text
    .replace(/\u00a0/g, " ")
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  const records: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (/^GCash Transaction History$/i.test(line)) continue;
    if (/^\d{4}-\d{2}-\d{2}\s+to\s+\d{4}-\d{2}-\d{2}$/i.test(line)) continue;
    if (/^Date and Time$/i.test(line)) continue;
    if (/^Description$/i.test(line)) continue;
    if (/^Reference No\.?$/i.test(line)) continue;
    if (/^Debit$/i.test(line)) continue;
    if (/^Credit$/i.test(line)) continue;
    if (/^Balance$/i.test(line)) continue;
    if (/^STARTING BALANCE$/i.test(line)) continue;
    if (/^Page\s+\d+\s+of\s+\d+$/i.test(line)) continue;

    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\b/.test(line)) {
      if (current.length > 0) {
        records.push(current.join(" "));
      }
      current = [line];
      continue;
    }

    if (current.length > 0) {
      current.push(line);
    }
  }

  if (current.length > 0) {
    records.push(current.join(" "));
  }

  const rows = records
    .map((record) => parseGcashTransactionRecord(record))
    .filter(Boolean) as ParsedImportRow[];

  return {
    metadata,
    rows,
  };
};

const guessBpiCategoryName = (description: string, type: TransactionType) => {
  const lower = description.toLowerCase();
  const compact = compactWhitespace(description).toLowerCase();
  if (/^beginning balance$/i.test(description)) return "Opening Balance";
  if (type === "transfer") return "Transfers";
  if (/taxwithheld|withheldtax|tax withheld|withheld tax/.test(lower) || /taxwithheld|withheldtax/.test(compact)) return "Financial";
  if (/instapay transfer fee|instapaytransferfee|transfer fee|transferfee/.test(lower) || /instapaytransferfee|transferfee/.test(compact)) {
    return "Transfers";
  }
  if (/service charge|bank charge/.test(lower)) return "Financial";
  if (/fee/.test(lower)) return "Financial";
  if (/bills payment|utility|bill|payment/.test(lower)) return "Bills & Utilities";
  if (/interest earned|interest/.test(lower)) return "Income";
  return guessCategoryName(description, type);
};

const parseBpiTransactionLine = (
  line: string,
  state: {
    year: number;
    previousMonthIndex: number | null;
    previousBalance: number | null;
    accountName: string;
    statementStartDate: string | null;
  }
) => {
  const normalized = normalizeWhitespace(line);
  const compact = compactWhitespace(normalized);
  const match =
    compact.match(/^((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\d{1,2}(?:,\d{4})?)(.+)$/i) ??
    compact.match(/^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)(.+)$/i) ??
    compact.match(/^(\d{1,2}(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?:,\d{4})?)(.+)$/i);

  if (!match) {
    return null;
  }

  const dateToken = match[1];
  const body = match[2] ?? "";
  let date: Date | null = null;

  if (/\//.test(dateToken)) {
    date = parseDateValue(dateToken);
  }

  if (!date) {
    const monthMatch = dateToken.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*(\d{1,2})(?:,?(\d{4}))?$/i);
    if (monthMatch) {
      const monthIndex = monthIndexByAbbr[monthMatch[1].slice(0, 3).toUpperCase()];
      if (monthIndex !== undefined) {
        const day = Number(monthMatch[2]);
        const explicitYear = monthMatch[3] ? Number(monthMatch[3]) : null;
        if (explicitYear !== null) {
          state.year = explicitYear;
        } else if (state.previousMonthIndex !== null && monthIndex < state.previousMonthIndex) {
          state.year += 1;
        }
        state.previousMonthIndex = monthIndex;
        date = new Date(Date.UTC(state.year, monthIndex, day, 12));
      }
    }

    if (!date) {
      const dayMonthMatch = dateToken.match(/^(\d{1,2})(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?:,?(\d{4}))?$/i);
      if (dayMonthMatch) {
        const monthIndex = monthIndexByAbbr[dayMonthMatch[2].slice(0, 3).toUpperCase()];
        if (monthIndex !== undefined) {
          const day = Number(dayMonthMatch[1]);
          const explicitYear = dayMonthMatch[3] ? Number(dayMonthMatch[3]) : null;
          if (explicitYear !== null) {
            state.year = explicitYear;
          } else if (state.previousMonthIndex !== null && monthIndex < state.previousMonthIndex) {
            state.year += 1;
          }
          state.previousMonthIndex = monthIndex;
          date = new Date(Date.UTC(state.year, monthIndex, day, 12));
        }
      }
    }
  } else {
    state.year = date.getUTCFullYear();
    state.previousMonthIndex = date.getUTCMonth();
  }

  if (!date) {
    return null;
  }

  const moneyMatches = body.match(/[0-9][0-9,]*\.\d{2}/g) ?? [];
  const currentBalance = parseMoney(moneyMatches.at(-1) ?? null);
  const previousBalance = state.previousBalance;
  const amountDelta =
    currentBalance !== null && previousBalance !== null ? currentBalance - previousBalance : parseMoney(moneyMatches.at(-2) ?? null) ?? 0;
  if (currentBalance !== null) {
    state.previousBalance = currentBalance;
  }

  const description = body
    .replace(/[0-9][0-9,]*\.\d{2}/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const classificationText = compactWhitespace(description).toLowerCase();

  const isOpeningBalance = /^BEGINNING BALANCE$/i.test(description);
  if (isOpeningBalance) {
    return null;
  }

  let type: TransactionType = amountDelta >= 0 ? "income" : "expense";
  if (/transfer/.test(classificationText) && !/fee/.test(classificationText)) {
    type = "transfer";
  } else if (/instapaytransferfee|transferfee/.test(classificationText)) {
    type = "transfer";
  } else if (/fee|taxwithheld|withheldtax|billspayment|payment|withdrawal|servicecharge/.test(classificationText)) {
    type = "expense";
  } else if (/interestearned/.test(classificationText)) {
    type = "income";
  }

  const amount = Math.abs(amountDelta).toFixed(2);
  const displayText = description || normalized;

  return {
    date: date.toISOString().slice(0, 10),
    amount,
    merchantRaw: humanizeMerchantText(displayText),
    merchantClean: summarizeMerchantText(displayText),
    description: displayText,
    categoryName: guessBpiCategoryName(displayText, type),
    accountName: state.accountName,
    type,
    rawPayload: {
      bank: "BPI",
      accountName: state.accountName,
      statementStartDate: state.statementStartDate,
      line: normalized,
      balance: currentBalance,
      amountDelta,
    },
  } satisfies ParsedImportRow;
};

const parseBpiImportText = (text: string) => {
  const normalizedText = normalizeBpiText(text);
  const metadata = bpiStatementMetadata(normalizedText);
  if (!metadata) {
    return null;
  }

  const lines = normalizedText
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  const startDate = metadata.startDate ? new Date(metadata.startDate) : null;
  const endDate = metadata.endDate ? new Date(metadata.endDate) : null;
  const openingBalance = metadata.openingBalance;
  const endingBalance = metadata.endingBalance;

  let year = startDate?.getUTCFullYear() ?? endDate?.getUTCFullYear() ?? new Date().getUTCFullYear();
  let previousMonthIndex: number | null = startDate ? startDate.getUTCMonth() : null;
  let previousBalance = openingBalance;
  const state = {
    year,
    previousMonthIndex,
    previousBalance,
    accountName: metadata.accountName ?? "BPI",
    statementStartDate: metadata.startDate,
  };

  const rows: ParsedImportRow[] = [];

  if (openingBalance !== null && startDate) {
    rows.push({
      date: startDate.toISOString().slice(0, 10),
      amount: openingBalance.toFixed(2),
      merchantRaw: "Beginning balance",
      merchantClean: "Beginning balance",
      description: `Beginning balance for ${metadata.accountName}`,
      categoryName: "Opening Balance",
      accountName: metadata.accountName ?? "BPI",
      type: "transfer",
      rawPayload: {
        bank: "BPI",
        kind: "opening_balance",
        accountName: metadata.accountName,
        accountNumber: metadata.accountNumber,
        openingBalance,
        endingBalance,
        statementStartDate: metadata.startDate,
        statementEndDate: metadata.endDate,
      },
    });
  }

  for (const line of lines) {
    const parsed = parseBpiTransactionLine(line, state);
    year = state.year;
    previousMonthIndex = state.previousMonthIndex;
    previousBalance = state.previousBalance;
    if (parsed) {
      rows.push(parsed);
    }
  }

  return {
    metadata,
    rows,
  };
};

const unionbankDatePattern = /^\d{2}\/\d{2}\/\d{2}$/;
const unionbankMoneyPattern = /^PHP\s*[0-9][0-9,]*\.\d{2}$/i;
const unionbankReferencePattern = /^[A-Z]{1,3}\d{4,}$/i;

const isUnionBankBoilerplateLine = (line: string) =>
  /^UNIONBANK\b/i.test(line) ||
  /^ACCOUNT NUMBER\b/i.test(line) ||
  /^TRANSACTION HISTORY AS OF\b/i.test(line) ||
  /^DATE$/i.test(line) ||
  /^CHECK NO\.$/i.test(line) ||
  /^REF\.?\s*NO\.?$/i.test(line) ||
  /^DESCRIPTION$/i.test(line) ||
  /^DEBIT$/i.test(line) ||
  /^CREDIT$/i.test(line) ||
  /^BALANCE$/i.test(line) ||
  /^PAGE\s+\d+\s+OF\s+\d+$/i.test(line) ||
  /^FOR BEST RESULTS, PRINT YOUR TRANSACTION HISTORY/i.test(line) ||
  /^FOR BILLING CONCERNS, YOU MAY CONTACT/i.test(line);

const unionbankStatementMetadata = (text: string): DetectedStatementMetadata | null => {
  const normalized = text.replace(/\u00a0/g, " ").trim();
  if (!/\bUNIONBANK\b/i.test(normalized) && !/TRANSACTION HISTORY AS OF/i.test(normalized)) {
    return null;
  }

  const lines = normalized
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  const accountLineIndex = lines.findIndex((line) => /^ACCOUNT NUMBER\b/i.test(line));
  const accountLine = accountLineIndex >= 0 ? lines[accountLineIndex] : normalized;
  const accountNumber = accountLine.match(/\b(?:ACCOUNT NUMBER|ACCOUNT NO\.?|ACCOUNT #)\b.*?(\d[\d\s-]{6,}\d)\b/i)?.[1]?.replace(/\D/g, "").slice(0, 16) || detectAccountNumberFromText(normalized);
  const accountName = formatUnionBankAccountName(accountNumber);

  const statementDateLine = lines.find((line) => /TRANSACTION HISTORY AS OF/i.test(line)) ?? "";
  const statementDateMatch = statementDateLine.match(/TRANSACTION HISTORY AS OF\s+(.+)$/i);
  const endDate = statementDateMatch?.[1] ? new Date(statementDateMatch[1]) : null;

  return {
    institution: "UnionBank",
    accountNumber,
    accountName,
    openingBalance: null,
    endingBalance: null,
    startDate: null,
    endDate: endDate && !Number.isNaN(endDate.getTime()) ? endDate.toISOString() : null,
  };
};

const guessUnionBankCategoryName = (description: string, type: TransactionType) => {
  const lower = description.toLowerCase();
  if (/^not applicable$/i.test(description)) return "Other";
  if (/interest earned/.test(lower)) return "Income";
  if (/bills payment/.test(lower)) return "Transfers";
  if (/sent to|transfer to|transfer from|online fund transfer|xendit transfer|cash in|cash out|received credit/.test(lower)) {
    return "Transfers";
  }
  if (/online instapay fee|instapay fee|transfer fee|service charge|withholding tax|withheld tax|tax withheld|\bfee\b/.test(lower)) {
    return "Financial";
  }
  if (/incoming credit/.test(lower)) return type === "income" ? "Income" : "Other";
  return guessCategoryName(description, type);
};

const parseUnionBankTransactionSegment = (segment: string[], state: { accountName: string }) => {
  if (segment.length === 0) {
    return null;
  }

  const firstLine = normalizeWhitespace(segment[0] ?? "");
  const dateMatch = firstLine.match(/^\d{2}\/\d{2}\/\d{2}/);
  const date = parseDateValue(dateMatch?.[0] ?? null);
  if (!date) {
    return null;
  }

  const body = [
    firstLine.slice(dateMatch?.[0].length ?? 0).trim(),
    ...segment.slice(1),
  ].filter((line) => line && !isUnionBankBoilerplateLine(line));
  const rowText = normalizeWhitespace(body.join(" "));
  const moneyMatches = Array.from(rowText.matchAll(/PHP\s*[0-9][0-9,]*\.\d{2}/gi));
  if (moneyMatches.length < 2) {
    return null;
  }

  const transactionAmountLine = moneyMatches[0][0];
  const balanceLine = moneyMatches.at(-1)?.[0] ?? null;
  const transactionAmount = parseMoney(transactionAmountLine?.replace(/^PHP\s*/i, "") ?? null);
  if (transactionAmount === null) {
    return null;
  }

  const refIndex = body.findIndex((line) => unionbankReferencePattern.test(line));
  let descriptionSource = rowText
    .replace(/PHP\s*[0-9][0-9,]*\.\d{2}/gi, " ")
    .replace(refIndex >= 0 ? body[refIndex] : "", " ");
  descriptionSource = descriptionSource.replace(/Date\s+Check No\.?\s+Ref\.?\s+No\.?\s+Description\s+Debit\s+Credit\s+Balance/gi, " ");
  descriptionSource = descriptionSource.replace(/Page\s+\d+\s+of\s+\d+/gi, " ");
  descriptionSource = descriptionSource.replace(/For billing concerns, you may contact our 24-Hour Customer Service at \+632 8841-8600 or send us your concern via our Mailbox-Support Feature\./gi, " ");
  descriptionSource = descriptionSource.replace(/For best results, print your Transaction History on A4 paper using portrait orientation at actual size or fit-to-page settings/gi, " ");
  const description = normalizeWhitespace(descriptionSource);
  if (!description || isUnionBankBoilerplateLine(description)) {
    return null;
  }

  const descriptionLower = description.toLowerCase();
  let type: TransactionType = "expense";
  if (/interest earned/.test(descriptionLower)) {
    type = "income";
  } else if (/not applicable|incoming credit|salary|payroll|cash in|received|credit memo/.test(descriptionLower)) {
    type = "income";
  } else if (/bills payment|transfer to|transfer from|sent to|received from|online fund transfer|xendit transfer/.test(descriptionLower)) {
    type = "transfer";
  } else if (/online instapay fee|instapay fee|transfer fee|service charge|withholding tax|withheld tax|tax withheld|\bfee\b/.test(descriptionLower)) {
    type = "expense";
  }

  return {
    date: date.toISOString().slice(0, 10),
    amount: transactionAmount.toFixed(2),
    merchantRaw: humanizeMerchantText(description),
    merchantClean: summarizeMerchantText(description),
    description,
    categoryName: guessUnionBankCategoryName(description, type),
    accountName: state.accountName,
    type,
    rawPayload: {
      bank: "UnionBank",
      accountName: state.accountName,
      line: segment.join(" "),
      amountText: transactionAmountLine,
      balanceText: balanceLine,
      description,
      referenceNo: refIndex >= 0 ? body[refIndex] : null,
    },
  } satisfies ParsedImportRow;
};

const parseUnionBankImportText = (text: string) => {
  const metadata = unionbankStatementMetadata(text);
  if (!metadata) {
    return null;
  }

  const lines = text
    .replace(/\u00a0/g, " ")
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter((line) => line && !isUnionBankBoilerplateLine(line));

  const segments: string[][] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (/^\d{2}\/\d{2}\/\d{2}\b/.test(line)) {
      if (current.length > 0) {
        segments.push(current);
      }
      current = [line];
      continue;
    }

    if (current.length > 0) {
      current.push(line);
    }
  }

  if (current.length > 0) {
    segments.push(current);
  }

  const rows = segments
    .map((segment) => parseUnionBankTransactionSegment(segment, { accountName: metadata.accountName ?? "UnionBank" }))
    .filter(Boolean) as ParsedImportRow[];

  return rows.length > 0
    ? {
        metadata,
        rows,
      }
    : null;
};

export const detectStatementMetadata = (text: string): DetectedStatementMetadata | null => {
  const gcashMetadata = gcashStatementMetadata(text);
  if (gcashMetadata) {
    return gcashMetadata;
  }

  const rcbcMetadata = rcbcStatementMetadata(text);
  if (rcbcMetadata) {
    return rcbcMetadata;
  }

  const unionbankMetadata = unionbankStatementMetadata(text);
  if (unionbankMetadata) {
    return unionbankMetadata;
  }

  const bpiMetadata = bpiStatementMetadata(text);
  if (bpiMetadata) {
    return bpiMetadata;
  }

  const normalized = text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  const institution = detectInstitutionFromText(normalized);
  const accountNumber = detectAccountNumberFromText(normalized);
  const { startDate, endDate } = detectStatementDatesFromText(normalized);
  const { openingBalance, endingBalance } = detectBalanceFromText(normalized);
  const accountName = institution && accountNumber
    ? `${institution} ${accountNumber.slice(-4)}`
    : institution
      ? institution
      : accountNumber
        ? `Account ${accountNumber.slice(-4)}`
        : null;

  if (!institution && !accountNumber && !startDate && !endDate && openingBalance === null && endingBalance === null) {
    return null;
  }

  return {
    institution,
    accountNumber,
    accountName,
    openingBalance,
    endingBalance,
    startDate: startDate ? startDate.toISOString() : null,
    endDate: endDate ? endDate.toISOString() : null,
  };
};

const parseDelimitedText = (text: string, delimiter: string) => {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (rows.length === 0) return [];

  const headers = splitLine(rows[0], delimiter).map((header) => header.toLowerCase());
  return rows.slice(1).map((line) => {
    const values = splitLine(line, delimiter);
    const record: Record<string, string> = {};

    headers.forEach((header, index) => {
      record[header] = values[index] ?? "";
    });

    return record;
  });
};

const inferType = (record: Record<string, string>): TransactionType => {
  const normalized = `${record.type ?? ""} ${record.category ?? ""} ${record.merchant ?? ""}`.toLowerCase();
  if (normalized.includes("transfer")) return "transfer";
  const amount = Number(String(record.amount ?? "0").replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(amount)) return "expense";
  return amount >= 0 ? "income" : "expense";
};

const parseHeuristicLines = (text: string) => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines
    .map((line) => {
      const dateMatch =
        line.match(/\b\d{4}-\d{2}-\d{2}\b/) ||
        line.match(/\b\d{1,2}[/-][A-Za-z]{3}[/-]\d{2,4}\b/) ||
        line.match(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/) ||
        line.match(/\b\d{1,2}[A-Za-z]{3}\d{4}\b/);
      const amountMatch = line.match(/[-+]?(?:PHP|USD|EUR|GBP|₱|\$)?\s?\d[\d,]*(?:\.\d{2})?/g);
      const amount = amountMatch?.at(-1) ?? "";
      const merchant = line
        .replace(dateMatch?.[0] ?? "", "")
        .replace(amount, "")
        .replace(/\b(PHP|USD|EUR|GBP|₱|\$)\b/g, "")
        .replace(/\s{2,}/g, " ")
        .trim();

      if (!dateMatch && !amount) {
        return null;
      }

      const normalizedAmount = amount.replace(/[^0-9.-]/g, "");
      const type: TransactionType = /credit|income|salary|payroll|deposit/i.test(line)
        ? "income"
        : /transfer/i.test(line)
          ? "transfer"
          : "expense";

      return {
        date: dateMatch?.[0],
        amount: normalizedAmount,
        merchantRaw: humanizeMerchantText(merchant || line),
        merchantClean: summarizeMerchantText(merchant || line),
        description: line,
        categoryName: guessCategoryName(line, type),
        type,
        rawPayload: { line },
      } satisfies ParsedImportRow;
    })
    .filter(Boolean) as ParsedImportRow[];
};

export const parseImportText = (text: string, fileName: string, fileType: string): ParsedImportRow[] => {
  const gcashParsed = parseGcashImportText(text);
  if (gcashParsed && gcashParsed.rows.length > 0) {
    return gcashParsed.rows;
  }

  const rcbcParsed = parseRcbcImportText(text);
  if (rcbcParsed) {
    return rcbcParsed.rows;
  }

  const unionbankParsed = parseUnionBankImportText(text);
  if (unionbankParsed) {
    return unionbankParsed.rows;
  }

  const bpiParsed = parseBpiImportText(text);
  if (bpiParsed) {
    return bpiParsed.rows;
  }

  const delimiter = delimiterForFile(fileType, fileName);
  const firstLine = text.split(/\r?\n/)[0] ?? "";
  const looksDelimited = /,|\t|;/.test(firstLine);

  if (!looksDelimited) {
    return parseHeuristicLines(text);
  }

  const records = parseDelimitedText(text, delimiter);

  return records.map((record) => ({
    date: record.date || record.transaction_date || record.posted_at || record.posted,
    amount: record.amount || record.value || record.debit || record.credit,
    merchantRaw: humanizeMerchantText(record.merchant || record.description || record.name || record.payee || record.label || ""),
    merchantClean: summarizeMerchantText(record.merchant_clean || record.clean_merchant || record.name || record.merchant || record.description || ""),
    description: record.description || record.memo || record.notes || record.detail,
    categoryName: record.category || record.category_name || guessCategoryName(record.description || record.merchant || "", inferType(record)),
    accountName: record.account || record.account_name || record.source,
    type: inferType(record),
    rawPayload: record,
  }));
};

export const parseDateValue = (value?: string | null) => {
  if (!value) return null;
  const normalized = value.trim();
  const iso = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12, 0, 0));
  }

  const slash = normalized.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slash) {
    let first = Number(slash[1]);
    let second = Number(slash[2]);
    let year = Number(slash[3]);
    if (slash[3].length === 2) {
      year += year >= 70 ? 1900 : 2000;
    }

    let month = first;
    let day = second;
    if (first > 12 && second <= 12) {
      month = second;
      day = first;
    }

    return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12, 0, 0));
};

export const parseAmountValue = (value?: string | null) => {
  if (!value) return null;
  const cleaned = String(value).replace(/[^0-9.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === "." || cleaned === "-.") {
    return null;
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && Math.abs(parsed) <= MAX_DECIMAL_AMOUNT ? parsed : null;
};
