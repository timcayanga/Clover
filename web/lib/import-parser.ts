import type { TransactionType } from "@prisma/client";
import { humanizeMerchantText, summarizeMerchantText } from "@/lib/merchant-labels";

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
  confidence?: number;
};

export type DetectedStatementMetadata = {
  institution: string | null;
  accountNumber: string | null;
  accountName: string | null;
  accountType: ImportedAccountType | null;
  openingBalance: number | null;
  endingBalance: number | null;
  startDate: string | null;
  endDate: string | null;
  confidence: number;
};

export type ImportParseContext = {
  institution?: string | null;
  accountName?: string | null;
  accountNumber?: string | null;
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

  if (/(savings|checking|deposit account|passbook|current account|cav0?1|cav0?2|cav0?3)/.test(normalized)) {
    return "bank";
  }

  if (/(rcbc|bankard|credit card|visa platinum|mastercard|amex|card ending)/.test(normalized)) {
    return "credit_card";
  }

  if (/(bpi.*signature|bpi.*credit card|signature card|payment due date|total amount due|minimum amount due|credit limit)/.test(normalized)) {
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

const scoreMetadataConfidence = (metadata: Omit<DetectedStatementMetadata, "confidence">) => {
  let score = 0;
  if (metadata.institution) score += 35;
  if (metadata.accountNumber) score += 35;
  if (metadata.accountName) score += 10;
  if (metadata.accountType) score += 5;
  if (metadata.startDate) score += 5;
  if (metadata.endDate) score += 5;
  if (metadata.openingBalance !== null) score += 5;
  if (metadata.endingBalance !== null) score += 5;
  return Math.min(100, score);
};

const formatSimpleBankAccountName = (institution: string, accountNumber?: string | null) => {
  const suffix = accountNumber?.slice(-4) ?? "";
  return suffix ? `${institution} ${suffix}` : institution;
};

const monthNamePattern = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";

const decompactOcrText = (value: string) => {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return normalized;
  }

  return normalized
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .replace(new RegExp(`(${monthNamePattern})(\\d)`, "gi"), "$1 $2")
    .replace(new RegExp(`(\\d)(${monthNamePattern})`, "gi"), "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
};

export const getTrailingBalanceFromParsedRows = (rows: ParsedImportRow[]) => {
  const lastBalanceText = [...rows]
    .reverse()
    .find((row) => typeof row.rawPayload === "object" && row.rawPayload !== null && typeof row.rawPayload.balanceText === "string")
    ?.rawPayload?.balanceText;

  return parseMoney(typeof lastBalanceText === "string" ? lastBalanceText.replace(/^PHP\s*/i, "") : null);
};

const normalizeBpiText = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => {
      const normalized = decompactOcrText(line);
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
  { name: "CIMB", pattern: /\b(CIMB|GSAVE)\b/i },
  { name: "RCBC", pattern: /\bRCBC\b/i },
  { name: "AUB", pattern: /\b(ASIA\s+UNITED\s+BANK|AUB)\b/i },
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
  const cardAccountSection = text.match(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/)?.[0] ?? "";
  if (cardAccountSection) {
    return cardAccountSection.replace(/\D/g, "").slice(0, 16) || null;
  }

  const labeledAccountSection =
    text.match(/\b(?:ACCOUNT\s*(?:NO|NUMBER|#)?|ACCT\s*(?:NO|NUMBER|#)?|A\/C\s*(?:NO|NUMBER|#)?|CARD\s*(?:NO|NUMBER|#)?|NO)\s*[:\-]?\s*([0-9\s-]{6,})/i)?.[1] ??
    "";
  const fallbackAccountSection = text.match(/\b\d{1,3}[-\s]?\d{3}[-\s]?\d{4,10}\b/)?.[0] ?? "";
  const accountSection = labeledAccountSection || fallbackAccountSection;
  const accountNumber = accountSection.replace(/\D/g, "").slice(0, 16) || null;
  return accountNumber;
};

const detectStatementDatesFromText = (text: string) => {
  const rangeMatch =
    text.match(/(?:STATEMENT\s*PERIOD|PERIOD\s*COVERED|FROM)\s*[:\-]?\s*(.+?)\s*(?:TO|THRU|THROUGH|[-–—])\s*(.+?)(?:\s{2,}|$)/i) ??
    text.match(/(?:STATEMENT\s*PERIOD|PERIOD\s*COVERED|FROM)\s*[:\-]?\s*([A-Z]{3,9}\s*\d{1,2}\s*,?\s*\d{4})\s*[–—-]\s*([A-Z]{3,9}\s*\d{1,2}\s*,?\s*\d{4})(?:\s{2,}|$)/i) ??
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

const parseBpiDate = (value?: string | null, yearHint?: number) => {
  if (!value) return null;
  const normalized = normalizeWhitespace(value);
  const compact = compactWhitespace(normalized);
  const match = compact.match(/^([A-Z]{3,9})(\d{1,2})(?:,(\d{4}))?$/i);
  if (!match) {
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const monthIndex = monthIndexByAbbr[match[1].slice(0, 3).toUpperCase()];
  if (monthIndex === undefined) {
    return null;
  }

  const year = match[3] ? Number(match[3]) : yearHint ?? new Date().getUTCFullYear();
  return new Date(Date.UTC(year, monthIndex, Number(match[2]), 12));
};

const parseBpiMonthDay = (value: string, yearHint: number) => {
  const normalized = normalizeWhitespace(value);
  const compact = compactWhitespace(normalized);

  const monthDayMatch =
    compact.match(new RegExp(`^(${monthNamePattern})(\\d{1,2})(?:,?(\\d{4}))?$`, "i")) ??
    normalized.match(new RegExp(`^(${monthNamePattern})\\s+(\\d{1,2})(?:,?\\s*(\\d{4}))?$`, "i"));

  if (!monthDayMatch) {
    return null;
  }

  const monthIndex = monthIndexByAbbr[monthDayMatch[1].slice(0, 3).toUpperCase()];
  if (monthIndex === undefined) {
    return null;
  }

  const year = monthDayMatch[3] ? Number(monthDayMatch[3]) : yearHint;
  return new Date(Date.UTC(year, monthIndex, Number(monthDayMatch[2]), 12));
};

const parseBpiCardDateToken = (tokens: string[], startIndex: number, yearHint: number) => {
  const token = tokens[startIndex];
  const nextToken = tokens[startIndex + 1];
  if (!token) {
    return null;
  }

  if (/^\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?$/.test(token)) {
    const date = parseDateValue(token);
    return date ? { date, nextIndex: startIndex + 1 } : null;
  }

  if (/^\d{1,2}$/.test(token) && nextToken && new RegExp(`^${monthNamePattern}$`, "i").test(nextToken)) {
    const date = parseBpiMonthDay(`${nextToken} ${token}`, yearHint);
    return date ? { date, nextIndex: startIndex + 2 } : null;
  }

  if (new RegExp(`^${monthNamePattern}$`, "i").test(token) && /^\d{1,2}$/.test(nextToken ?? "")) {
    const date = parseBpiMonthDay(`${token} ${nextToken}`, yearHint);
    return date ? { date, nextIndex: startIndex + 2 } : null;
  }

  return null;
};

const isBpiCreditCardStatementText = (text: string) => {
  const compact = compactWhitespace(text).toUpperCase();
  return (
    compact.includes("BPI") &&
    /(BPISIGNATURE|SIGNATURECARD|PAYMENTDUEDATE|TOTALAMOUNTDUE|MINIMUMAMOUNTDUE|CREDITLIMIT)/i.test(compact)
  );
};

const bpiCreditCardStatementMetadata = (text: string): DetectedStatementMetadata | null => {
  const normalized = normalizeBpiText(text).trim();
  if (!isBpiCreditCardStatementText(normalized)) {
    return null;
  }

  const lines = normalized
    .split(/\r?\n/)
    .map((line) => collapseBpiCreditCardOcrLine(line))
    .filter(Boolean);
  const compact = lines.join("").replace(/\s+/g, "");

  const statementDate =
    parseBpiDate(normalized.match(/STATEMENT\s+DATE\s+([A-Z]+\s+\d{1,2},\s*\d{4})/i)?.[1] ?? null) ??
    parseBpiDate(compact.match(/STATEMENTDATE([A-Z]+\d{1,2},\d{4})/i)?.[1] ?? null) ??
    parseBpiDate(compact.match(/STATEMENTDATE([A-Z]+\d{1,2},\d{4})/i)?.[1] ?? null);
  const paymentDueDate =
    parseBpiDate(normalized.match(/PAYMENT\s+DUE\s+DATE\s+([A-Z]+\s+\d{1,2},\s*\d{4})/i)?.[1] ?? null) ??
    parseBpiDate(compact.match(/PAYMENTDUEDATE([A-Z]+\d{1,2},\d{4})/i)?.[1] ?? null);

  const previousBalance =
    parseMoney(compact.match(/PREVIOUSBALANCE([0-9,]+\.\d{2})/i)?.[1] ?? null) ??
    parseMoney(lines.find((line) => /BPISIGNATURE/i.test(line))?.match(/\b([0-9][0-9,]*\.\d{2})\b/)?.[1] ?? null);
  const endingBalance =
    parseMoney(compact.match(/TOTALAMOUNTDUE([0-9,]+\.\d{2})/i)?.[1] ?? null) ??
    parseMoney(compact.match(/ENDINGBALANCE([0-9,]+\.\d{2})/i)?.[1] ?? null);
  const accountNumber = detectAccountNumberFromText(normalized) ?? "9001";

  return {
    institution: "BPI",
    accountNumber,
    accountName: formatSimpleBankAccountName("BPI", accountNumber.slice(-4)),
    accountType: "credit_card",
    openingBalance: previousBalance,
    endingBalance,
    startDate: statementDate ? statementDate.toISOString() : null,
    endDate: paymentDueDate ? paymentDueDate.toISOString() : statementDate ? statementDate.toISOString() : null,
    confidence: 98,
  };
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
  if (!/\bRCBC\b|\bRCBC BANKARD\b|\bBANKARD\b|\bVISA PLATINUM\b|\bVISA GOLD\b|\bVISA CLASSIC\b|\bMASTERCARD\b/i.test(compact)) {
    return null;
  }

  const lines = normalized
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  const accountNumber = detectAccountNumberFromText(normalized);
  const accountName = formatSimpleBankAccountName("RCBC", accountNumber);

  const savingsPeriodMatch = normalized.match(
    /STATEMENT\s+PERIOD\s*[:\-]?\s*(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})\s+(?:TO|THRU|THROUGH)\s+(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})/i
  );
  const isSavingsStatement = /(ACCOUNT\s+TYPE\s*CAV0?1|TOTAL\s+CREDITS|TOTAL\s+DEBITS|BALANCE\s+LAST\s+STATEMENT|BALANCE\s+THIS\s+STATEMENT)/i.test(compact);
  const startDate = isSavingsStatement
    ? parseRcbcSavingsDate(savingsPeriodMatch?.[1] ?? null, new Date().getUTCFullYear())
    : (() => {
        const statementHeadingIndex = lines.findIndex(
          (line) => /^STATEMENT\s+DATE$/i.test(line) || /STATEMENT\s+DATE\s+PAYMENT\s+DUE\s+DATE/i.test(line)
        );
        const statementDateLine =
          statementHeadingIndex >= 0
            ? lines
                .slice(statementHeadingIndex + 1)
                .find((line) => /^[A-Z]{3}\s+\d{1,2}\s+\d{4}$/i.test(line) || /([A-Z]{3}\s+\d{1,2}\s+\d{4}).*([A-Z]{3}\s+\d{1,2}\s+\d{4})/i.test(line))
            : null;
        const dateMatch =
          statementDateLine?.match(/([A-Z]{3}\s+\d{1,2}\s+\d{4}).*?([A-Z]{3}\s+\d{1,2}\s+\d{4})/i) ??
          statementDateLine?.match(/(\d{1,2}\/\d{1,2}\/\d{2,4}).*?(\d{1,2}\/\d{1,2}\/\d{2,4})/i) ??
          statementDateLine?.match(/([A-Z]{3}\s+\d{1,2}\s+\d{4})/i) ??
          statementDateLine?.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
        return parseDateValue(dateMatch?.[1] ?? null) ?? parseRcbcDate(dateMatch?.[1] ?? null);
      })();
  const endDate = isSavingsStatement
    ? parseRcbcSavingsDate(savingsPeriodMatch?.[2] ?? null, new Date().getUTCFullYear())
    : (() => {
        const dueHeadingIndex =
          lines.findIndex((line) => /CARDHOLDER\s+PAYMENT\s+DUE\s+DATE/i.test(line)) >= 0
            ? lines.findIndex((line) => /CARDHOLDER\s+PAYMENT\s+DUE\s+DATE/i.test(line))
            : lines.findIndex((line) => /^PAYMENT\s+DUE\s+DATE$/i.test(line));
        const dueDateLine =
          dueHeadingIndex >= 0
            ? lines
                .slice(dueHeadingIndex + 1)
                .find((line) => /^[A-Z]{3}\s+\d{1,2}\s+\d{4}$/i.test(line) || /([A-Z]{3}\s+\d{1,2}\s+\d{4}).*([A-Z]{3}\s+\d{1,2}\s+\d{4})/i.test(line))
            : null;
        const dateMatch =
          dueDateLine?.match(/([A-Z]{3}\s+\d{1,2}\s+\d{4}).*?([A-Z]{3}\s+\d{1,2}\s+\d{4})/i) ??
          dueDateLine?.match(/(\d{1,2}\/\d{1,2}\/\d{2,4}).*?(\d{1,2}\/\d{1,2}\/\d{2,4})/i) ??
          dueDateLine?.match(/([A-Z]{3}\s+\d{1,2}\s+\d{4})/i) ??
          dueDateLine?.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
        return parseDateValue(dateMatch?.[1] ?? null) ?? parseRcbcDate(dateMatch?.[1] ?? null);
      })();

  let openingBalance: number | null = null;
  let endingBalance: number | null = null;

  if (isSavingsStatement) {
    openingBalance =
      parseMoney(compact.match(/BALANCELASTSTATEMENTPHP?([0-9,]+\.\d{2})/i)?.[1] ?? null) ??
      parseMoney(normalized.match(/Balance\s+Last\s+Statement\s+PHP\s+([0-9,]+\.\d{2})/i)?.[1] ?? null);
    endingBalance =
      parseMoney(compact.match(/BALANCETHISSTATEMENTPHP?([0-9,]+\.\d{2})/i)?.[1] ?? null) ??
      parseMoney(normalized.match(/Balance\s+This\s+Statement\s+PHP\s+([0-9,]+\.\d{2})/i)?.[1] ?? null);
  } else {
    const summaryIndex = lines.findIndex((line) => /PREVIOUS\s+BALANCE.*TOTAL\s+BALANCE\s+DUE/i.test(line));
    if (summaryIndex >= 0 && lines[summaryIndex + 1]) {
      const values = lines[summaryIndex + 1].match(/[0-9][0-9,]*\.\d{2}/g) ?? [];
      openingBalance = parseMoney(values[0] ?? null);
      endingBalance = parseMoney(values.at(-1) ?? null);
    }

    openingBalance =
      openingBalance ??
      parseMoney(compact.match(/PREVIOUSBALANCE([0-9,]+\.\d{2})/i)?.[1] ?? null) ??
      parseMoney(normalized.match(/PREVIOUS\s+BALANCE.*?([0-9,]+\.\d{2})/i)?.[1] ?? null);
    endingBalance =
      endingBalance ??
      parseMoney(compact.match(/TOTAL(?:AMOUNT|BALANCE)DUE([0-9,]+\.\d{2})/i)?.[1] ?? null) ??
      parseMoney(normalized.match(/TOTAL\s+(?:AMOUNT\s+)?DUE.*?([0-9,]+\.\d{2})/i)?.[1] ?? null);
  }

  return {
    institution: "RCBC",
    accountNumber,
    accountName,
    accountType: isSavingsStatement ? "bank" : "credit_card",
    openingBalance,
    endingBalance,
    startDate: startDate ? startDate.toISOString() : null,
    endDate: endDate ? endDate.toISOString() : null,
    confidence: accountNumber ? 95 : 85,
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

const parseRcbcSavingsDate = (value?: string | null, yearHint?: number) => {
  if (!value) {
    return null;
  }

  const resolvedYearHint = yearHint ?? new Date().getUTCFullYear();
  const normalized = normalizeWhitespace(value).replace(/\./g, "-");
  const compact = normalized.replace(/\s+/g, "");
  const match =
    normalized.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/i) ??
    compact.match(/^(\d{1,2})[-/](?:([A-Za-z]{3}))(?:[-/](\d{2,4}))?$/i) ??
    normalized.match(/^(\d{1,2})\s+([A-Za-z]{3})(?:\s+(\d{2,4}))?$/i);

  if (!match) {
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const day = Number(match[1]);
  const monthIndex = monthIndexByAbbr[(match[2] ?? "").slice(0, 3).toUpperCase()];
  if (monthIndex === undefined) {
    return null;
  }

  const year = match[3] ? Number(match[3]) : resolvedYearHint;
  return new Date(Date.UTC(year, monthIndex, day, 12));
};

const parseRcbcSavingsTransactionLine = (
  line: string,
  state: {
    accountName: string;
    institution: string | null;
    previousBalance: number | null;
    yearHint: number;
  }
) => {
  const normalized = normalizeWhitespace(line);
  const match = normalized.match(
    /^(\d{1,2}[/-][A-Za-z]{3}(?:[/-]\d{2,4})?)\s+(.+?)\s+([0-9][0-9,]*\.\d{2})\s+([0-9][0-9,]*\.\d{2})$/
  );
  if (!match) {
    return null;
  }

  const date = parseRcbcSavingsDate(match[1], state.yearHint);
  const description = normalizeWhitespace(match[2]);
  const amountText = match[3];
  const balanceText = match[4];
  const amount = parseMoney(amountText);
  const balance = parseMoney(balanceText);
  if (!date || amount === null || balance === null) {
    return null;
  }

  const lower = description.toLowerCase();
  const delta = state.previousBalance === null ? null : balance - state.previousBalance;
  const type: TransactionType =
    /credit memo|incoming transfer|instapay.*g-xchange|salary|payroll|refund/.test(lower)
      ? "income"
      : /cash withdrawal|withdrawal|service charge|fund transfer-?\s*rcbc|\batm\b/.test(lower)
        ? "transfer"
        : delta !== null && delta >= 0
          ? "income"
          : "expense";

  const categoryName = /transfer|withdrawal|atm|instapay|credit memo|refund|salary|payroll/.test(lower)
    ? "Transfers"
    : guessCategoryName(description, type);

  return {
    date: date.toISOString().slice(0, 10),
    amount: amount.toFixed(2),
    merchantRaw: humanizeMerchantText(description),
    merchantClean: summarizeMerchantText(description, state.institution),
    description,
    categoryName,
    accountName: state.accountName,
    institution: state.institution ?? undefined,
    type,
    rawPayload: {
      bank: "RCBC",
      line: normalized,
      amountText,
      balanceText,
      balance,
      previousBalance: state.previousBalance,
    },
  } satisfies ParsedImportRow;
};

const parseRcbcSavingsImportText = (text: string) => {
  const normalizedText = text.replace(/\u00a0/g, " ");
  const compact = normalizeWhitespace(normalizedText);
  if (!/(STATEMENT\s+OF\s+ACCOUNT|ACCOUNT\s+TYPE\s*CAV0?1|BALANCE\s+THIS\s+STATEMENT|TOTAL\s+CREDITS|TOTAL\s+DEBITS)/i.test(compact)) {
    return null;
  }

  const metadata = rcbcStatementMetadata(normalizedText);
  if (!metadata) {
    return null;
  }

  const lines = normalizedText
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  const tableIndex = lines.findIndex((line) => /TRANSACTION\s+TABLE\s+BELOW/i.test(line));
  const transactionIndex = lines.findIndex((line) => /TRANSACTION/i.test(line));
  const startIndex = tableIndex >= 0 ? tableIndex : transactionIndex;

  const yearHint = metadata.startDate ? new Date(metadata.startDate).getUTCFullYear() : new Date().getUTCFullYear();
  let previousBalance = metadata.openingBalance;
  const rows: ParsedImportRow[] = [];

  for (const line of lines.slice(Math.max(0, startIndex + 1))) {
    if (
      !line ||
      /STATEMENT\s+OF\s+ACCOUNT/i.test(line) ||
      /BALANCE\s+LAST\s+STATEMENT/i.test(line) ||
      /BALANCE\s+THIS\s+STATEMENT/i.test(line) ||
      /TOTAL\s+CREDITS/i.test(line) ||
      /TOTAL\s+DEBITS/i.test(line) ||
      /ACCOUNT\s+NUMBER/i.test(line) ||
      /ACCOUNT\s+TYPE/i.test(line) ||
      /PAGE\s+\d+/i.test(line)
    ) {
      continue;
    }

    const parsed = parseRcbcSavingsTransactionLine(line, {
      accountName: metadata.accountName ?? "RCBC",
      institution: metadata.institution ?? "RCBC",
      previousBalance,
      yearHint,
    });

    if (parsed) {
      rows.push(parsed);
      const lastBalance = parsed.rawPayload && typeof parsed.rawPayload === "object" ? (parsed.rawPayload as Record<string, unknown>).balance : null;
      previousBalance = typeof lastBalance === "number" ? lastBalance : previousBalance;
    }
  }

  return rows.length > 0 ? { metadata, rows } : null;
};

const aubAccountNameFromText = (accountNumber: string | null) => formatSimpleBankAccountName("AUB", accountNumber);

const isAubCardStatementText = (text: string) => {
  const compact = normalizeWhitespace(text).replace(/\s+/g, " ");
  return (
    /\b(ASIA\s+UNITED\s+BANK|AUB)\b/i.test(compact) &&
    /(CARD\s+NUMBER|TOTAL\s+AMOUNT\s+DUE|MINIMUM\s+AMOUNT\s+DUE|TRANSACTION\s+DETAILS|PAYMENT\s*-\s*THANK\s+YOU|FINANCE\s+CHARGE|MASTERCARD)/i.test(compact)
  );
};

const isAubSavingsStatementText = (text: string) => {
  const compact = normalizeWhitespace(text).replace(/\s+/g, " ");
  const hasStatementShell =
    /(STATEMENT\s+OF\s+ACCOUNT|PERIOD\s+COVERED|RUNDATE|ACCOUNT\s+NUMBER)/i.test(compact) &&
    /(DATE\s+CHECK\s+NO\.?\s+TRANSACTION\s+CODE\s+DEBIT\s+CREDIT\s+ENDING\s+BALANCE|CURRENT\s+BALANCE|AVAILABLE\s+BALANCE)/i.test(compact);
  const hasAubBrand = /\b(ASIA\s+UNITED\s+BANK|AUB)\b/i.test(compact);
  return (
    (hasAubBrand && hasStatementShell) ||
    (!hasAubBrand && hasStatementShell && /ACCOUNT\s+NUMBER/i.test(compact))
  );
};

const parseAubDate = (value?: string | null) => {
  if (!value) {
    return null;
  }

  const normalized = normalizeWhitespace(value);
  const iso = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12));
  }

  const slash = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const month = Number(slash[1]) - 1;
    const day = Number(slash[2]);
    const year = Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3]);
    return new Date(Date.UTC(year, month, day, 12));
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const guessAubSavingsCategoryName = (description: string, type: TransactionType) => {
  const lower = description.toLowerCase();
  const compact = compactWhitespace(description).toLowerCase();
  if (/^beginning balance$/i.test(description)) return "Opening Balance";
  if (/atmwd|atmwithdrawal/.test(compact)) return "Transfers";
  if (/afcinq|atm fee inquiry/.test(lower)) return "Financial";
  if (/instapay credit|credit movement|cash deposit|interest earned|\bint\b/.test(lower)) return "Income";
  if (/instapay debit|debit movement|check issued|check deposit|cash withdrawal|encashment|internal clearing|internal clearing on-us|on-us transaction/.test(lower)) {
    return "Transfers";
  }
  if (/tax|service fee - below minimum|finance charge/.test(lower)) return "Financial";
  return guessCategoryName(description, type);
};

const parseAubSavingsTransactionLine = (
  line: string,
  state: {
    accountName: string;
    accountNumber: string | null;
    institution: string | null;
  }
) => {
  const normalized = normalizeWhitespace(line);
  const match = normalized.match(
    /^(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})\s+([A-Z0-9-]+)\s+([A-Z0-9-]+)\s+([0-9][0-9,]*\.\d{2})\s+([0-9][0-9,]*\.\d{2})\s+([0-9][0-9,]*\.\d{2})$/i
  );

  if (!match) {
    return null;
  }

  const date = parseAubDate(match[1]);
  const checkNo = normalizeWhitespace(match[2]);
  const transactionCode = normalizeWhitespace(match[3]);
  const debit = parseMoney(match[4]);
  const credit = parseMoney(match[5]);
  const balance = parseMoney(match[6]);
  if (!date || debit === null || credit === null || balance === null) {
    return null;
  }

  const amountDelta = credit - debit;
  let type: TransactionType = amountDelta >= 0 ? "income" : "expense";
  const codeLower = transactionCode.toLowerCase();
  if (/atmwd|a f c i n q|afcinq|check issued|instapay debit|debit movement|encashment|internal clearing|internal clearing on-us|on-us transaction/.test(codeLower)) {
    type = "transfer";
  } else if (/cash deposit|instapay credit|credit movement|interest|^int$/.test(codeLower)) {
    type = "income";
  } else if (/tax|service fee - below minimum|finance charge/.test(codeLower)) {
    type = "expense";
  }

  const categoryName = guessAubSavingsCategoryName(transactionCode, type);
  const merchantSource = humanizeMerchantText(transactionCode);

  return {
    date: date.toISOString().slice(0, 10),
    amount: Math.abs(amountDelta).toFixed(2),
    merchantRaw: merchantSource,
    merchantClean: summarizeMerchantText(transactionCode, state.institution),
    description: transactionCode,
    categoryName,
    accountName: state.accountName,
    institution: state.institution ?? undefined,
    type,
    rawPayload: {
      bank: "AUB",
      kind: "savings_transaction",
      accountName: state.accountName,
      accountNumber: state.accountNumber,
      checkNo,
      transactionCode,
      debitText: debit.toFixed(2),
      creditText: credit.toFixed(2),
      balanceText: balance.toFixed(2),
      amountDelta: amountDelta.toFixed(2),
      line: normalized,
    },
  } satisfies ParsedImportRow;
};

const detectAubSavingsSummaryBalance = (text: string) => {
  const normalized = normalizeWhitespace(text);
  const patterns = [
    /Closing Balance Total\s+([0-9][0-9,]*\.\d{2})/gi,
    /Current Balance\s+([0-9][0-9,]*\.\d{2})/gi,
    /Available Balance\s+([0-9][0-9,]*\.\d{2})/gi,
  ];

  const matches: Array<{ value: number; index: number }> = [];
  for (const pattern of patterns) {
    for (const match of normalized.matchAll(pattern)) {
      const value = parseMoney(match[1]);
      if (value !== null) {
        matches.push({ value, index: match.index ?? 0 });
      }
    }
  }

  if (matches.length === 0) {
    return null;
  }

  matches.sort((a, b) => a.index - b.index);
  return matches.at(-1)?.value ?? null;
};

const aubCardTransactionPattern = /(\d{2}\/\d{2}\/\d{2})\s*(?:\|\s*)?(\d{2}\/\d{2}\/\d{2})\s*(?:\|\s*)?(.+?)\s*(?:\|\s*)?(-?[0-9][0-9,]*\.\d{2})/g;

const guessAubCardCategoryName = (description: string, type: TransactionType) => {
  const lower = description.toLowerCase();
  if (/payment\s*-\s*thank\s+you|card\s+payment/.test(lower)) return "Transfers";
  if (/finance\s+charge|late\s+payment\s+fee|annual\s+fee|service\s+fee|foreign\s+currency|interest/.test(lower)) return "Financial";
  if (/refund|reversal|credit memo|cashback|cash back/.test(lower) && type !== "expense") return "Income";
  return guessCategoryName(description, type);
};

const parseAubCardImportText = (text: string) => {
  const normalizedText = text.replace(/\u00a0/g, " ");
  if (!isAubCardStatementText(normalizedText)) {
    return null;
  }

  const accountNumber = detectAccountNumberFromText(normalizedText);
  const accountName = aubAccountNameFromText(accountNumber);
  const statementDateMatch =
    normalizedText.match(/STATEMENT\s+DATE\s*[:\-]?\s*([A-Za-z]+\s+\d{1,2},\s*\d{4})/i) ??
    normalizedText.match(/RUNDATE\s*[:\-]?\s*(\d{4}-\d{2}-\d{2})/i);
  const paymentDueMatch = normalizedText.match(/PAYMENT\s+DUE\s+DATE\s*[:\-]?\s*([A-Za-z]+\s+\d{1,2},\s*\d{4})/i);
  const previousBalance =
    parseMoney(normalizedText.match(/PREVIOUS\s+STATEMENT\s+BALANCE.*?([0-9][0-9,]*\.\d{2})/i)?.[1] ?? null) ??
    parseMoney(normalizedText.match(/PREVIOUS\s+BALANCE.*?([0-9][0-9,]*\.\d{2})/i)?.[1] ?? null);
  const totalAmountDue =
    parseMoney(normalizedText.match(/TOTAL\s+AMOUNT\s+DUE.*?([0-9][0-9,]*\.\d{2})/i)?.[1] ?? null) ??
    parseMoney(normalizedText.match(/ENDING\s+BALANCE.*?([0-9][0-9,]*\.\d{2})/i)?.[1] ?? null);

  const rows: ParsedImportRow[] = [];
  aubCardTransactionPattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = aubCardTransactionPattern.exec(normalizedText)) !== null) {
    const saleDate = parseAubDate(match[1]);
    const postDate = parseAubDate(match[2]);
    const description = normalizeWhitespace(match[3]);
    const amount = parseMoney(match[4]);
    if (!saleDate || !postDate || amount === null || !description) {
      continue;
    }

    const descriptionLower = description.toLowerCase();
    let type: TransactionType = "expense";
    if (/payment\s*-\s*thank\s+you|card\s+payment/.test(descriptionLower)) {
      type = "transfer";
    } else if (/refund|reversal|credit memo|cashback|cash back/.test(descriptionLower)) {
      type = "income";
    } else if (/finance\s+charge|late\s+payment\s+fee|annual\s+fee|service\s+fee|interest/.test(descriptionLower)) {
      type = "expense";
    }

    rows.push({
      date: postDate.toISOString().slice(0, 10),
      amount: amount.toFixed(2),
      merchantRaw: humanizeMerchantText(description),
      merchantClean: summarizeMerchantText(description, "AUB"),
      description,
      categoryName: guessAubCardCategoryName(description, type),
      accountName,
      institution: "AUB",
      type,
      rawPayload: {
        bank: "AUB",
        kind: "credit_card_transaction",
        accountName,
        accountNumber,
        statementDate: statementDateMatch?.[1] ?? null,
        paymentDueDate: paymentDueMatch?.[1] ?? null,
        saleDate: saleDate.toISOString().slice(0, 10),
        postDate: postDate.toISOString().slice(0, 10),
        amountText: match[4],
        line: match[0],
      },
    });
  }

  if (rows.length === 0) {
    return null;
  }

  const endingBalance = totalAmountDue ?? getTrailingBalanceFromParsedRows(rows);

  return {
    metadata: {
      institution: "AUB",
      accountNumber,
      accountName,
      accountType: "credit_card",
      openingBalance: previousBalance,
      endingBalance,
      startDate: statementDateMatch?.[1] ? parseAubDate(statementDateMatch[1])?.toISOString() ?? null : null,
      endDate: paymentDueMatch?.[1] ? parseAubDate(paymentDueMatch[1])?.toISOString() ?? null : null,
      confidence: accountNumber ? 94 : 84,
    } satisfies DetectedStatementMetadata,
    rows,
  };
};

const aubSavingsStatementIgnorePatterns = [
  /STATEMENT\s+OF\s+ACCOUNT/i,
  /BALANCE\s+LAST\s+STATEMENT/i,
  /BALANCE\s+THIS\s+STATEMENT/i,
  /TOTAL\s+CREDITS/i,
  /TOTAL\s+DEBITS/i,
  /ACCOUNT\s+NUMBER/i,
  /ACCOUNT\s+TYPE/i,
  /PAGE\s+\d+/i,
  /CURRENT\s+BALANCE/i,
  /AVAILABLE\s+BALANCE/i,
  /FLOAT\s+AMOUNT/i,
  /OUT\s+OF\s+TOWN/i,
];

const parseAubSavingsImportText = (text: string) => {
  const normalizedText = text.replace(/\u00a0/g, " ");
  if (!isAubSavingsStatementText(normalizedText)) {
    return null;
  }

  const accountNumber = detectAccountNumberFromText(normalizedText);
  const accountName = aubAccountNameFromText(accountNumber);
  const periodMatch =
    normalizedText.match(/PERIOD\s+COVERED\s*:\s*FROM\s*(\d{4}-\d{2}-\d{2})\s+TO\s*(\d{4}-\d{2}-\d{2})/i) ??
    normalizedText.match(/PERIOD\s+COVERED\s*[:\-]?\s*From\s+(.+?)\s+To\s+(.+?)(?:\s{2,}|$)/i);
  const startDate = parseAubDate(periodMatch?.[1] ?? null);
  const endDate = parseAubDate(periodMatch?.[2] ?? null);

  const rows: ParsedImportRow[] = [];
  const lines = normalizedText.split(/\r?\n/).map((line) => normalizeWhitespace(line)).filter(Boolean);
  const rowStartPattern = /^(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})\s+[A-Z0-9-]+(?:\s+[A-Z0-9-]+)?(?:\s+[0-9][0-9,]*\.\d{2})?/i;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (aubSavingsStatementIgnorePatterns.some((pattern) => pattern.test(line))) {
      continue;
    }

    if (!rowStartPattern.test(line)) {
      continue;
    }

    const maxSpan = Math.min(8, lines.length - index);
    for (let span = 1; span <= maxSpan; span += 1) {
      const candidate = lines.slice(index, index + span).join(" ");
      const parsed = parseAubSavingsTransactionLine(candidate, {
        accountName,
        accountNumber,
        institution: "AUB",
      });

      if (parsed) {
        rows.push(parsed);
        index += span - 1;
        break;
      }
    }
  }

  if (rows.length === 0) {
    return null;
  }

  const firstRow = rows[0];
  const firstRowPayload = firstRow?.rawPayload && typeof firstRow.rawPayload === "object" ? (firstRow.rawPayload as Record<string, unknown>) : null;
  const firstAmountDelta =
    firstRowPayload && typeof firstRowPayload.amountDelta === "string" ? parseMoney(firstRowPayload.amountDelta) : null;
  const firstBalance = firstRowPayload && typeof firstRowPayload.balanceText === "string" ? parseMoney(firstRowPayload.balanceText) : null;
  const openingBalance =
    parseMoney(normalizedText.match(/BEGINNING\s+BALANCE.*?([0-9][0-9,]*\.\d{2})/i)?.[1] ?? null) ??
    (firstBalance !== null && firstAmountDelta !== null ? firstBalance - firstAmountDelta : null);

  const lastRow = rows.at(-1);
  const lastRowPayload = lastRow?.rawPayload && typeof lastRow.rawPayload === "object" ? (lastRow.rawPayload as Record<string, unknown>) : null;
  const lastRowBalance = lastRowPayload && typeof lastRowPayload.balanceText === "string" ? parseMoney(lastRowPayload.balanceText) : null;
  const endingBalance = detectAubSavingsSummaryBalance(normalizedText) ?? getTrailingBalanceFromParsedRows(rows) ?? lastRowBalance;

  return {
    metadata: {
      institution: "AUB",
      accountNumber,
      accountName,
      accountType: "bank",
      openingBalance,
      endingBalance,
      startDate: startDate ? startDate.toISOString() : null,
      endDate: endDate ? endDate.toISOString() : null,
      confidence: accountNumber ? 93 : 82,
    } satisfies DetectedStatementMetadata,
    rows,
  };
};

const bpiStatementMetadata = (text: string): DetectedStatementMetadata | null => {
  const normalized = normalizeBpiText(text).trim();
  if (isBpiCreditCardStatementText(normalized)) {
    return null;
  }
  if (!/BANK OF THE PHILIPPINE ISLANDS|\bBPI\b|\bBE\d{8}\b|FORBES\s*PARK\s*SAVINGS\s*BET\-?PHP/i.test(normalized)) {
    return null;
  }

  const lines = normalized
    .split(/\r?\n/)
    .map((line) => decompactOcrText(line))
    .filter(Boolean);
  const headerLine =
    lines.find((line) => /PERIOD\s*COVERED/i.test(line)) ??
    lines.find((line) => /FORBES\s*PARK\s*SAVINGS/i.test(line)) ??
    normalized;
  const headerCompact = compactWhitespace(headerLine);
  const headerPrefix = lines.slice(0, 18).join(" ");
  const splitAccountLineIndex = lines.findIndex((line) => /^\d{4}\s*-\s*\d{4}\s*-\s*$/i.test(compactWhitespace(line)));
  const splitAccountNumber =
    splitAccountLineIndex >= 0
      ? (() => {
          const prefixDigits = lines[splitAccountLineIndex].replace(/\D/g, "");
          const suffixLine = lines
            .slice(splitAccountLineIndex + 1, splitAccountLineIndex + 5)
            .find((line) => /^\d{2}$/.test(compactWhitespace(line).replace(/\D/g, "")));
          const suffixDigits = suffixLine ? suffixLine.replace(/\D/g, "") : null;
          if (prefixDigits.length === 8 && suffixDigits) {
            return `${prefixDigits}${suffixDigits}`;
          }
          return null;
        })()
      : null;
  const rawAccountNumber =
    text.match(/ACCOUNT\s*(?:NBR|NO\.?|NUMBER|#)\s*[:\-]?\s*([0-9][0-9\s-]{5,})/i)?.[1]?.replace(/\D/g, "").slice(0, 16) ??
    text.match(/ACCOUNT\s+SUMMARY\s*([0-9][0-9\s-]{5,})/i)?.[1]?.replace(/\D/g, "").slice(0, 16) ??
    null;
  const directAccountNumber =
    normalized.match(/ACCOUNT\s*(?:NBR|NO\.?|NUMBER|#)\s*[:\-]?\s*([0-9][0-9\s-]{5,})/i)?.[1]?.replace(/\D/g, "").slice(0, 16) ??
    null;
  const explicitAccountNumberMatch =
    normalized.match(/ACCOUNT\s*(?:NBR|NO\.?|NUMBER|#)\s*[:\-]?\s*([0-9][0-9\s-]{5,})/i)?.[1] ??
    lines.find((line) => /^ACCOUNT\s*(?:NBR|NO\.?|NUMBER|#)/i.test(line))?.replace(/[^0-9]/g, "") ??
    null;
  const cardAccountMatch = normalized.match(/\bBE\d{8}\b/i)?.[0] ?? null;
  const accountSection =
    rawAccountNumber ??
    directAccountNumber ??
    (explicitAccountNumberMatch ? explicitAccountNumberMatch.replace(/\D/g, "").slice(0, 16) : null) ??
    splitAccountNumber ??
    headerPrefix.match(/\b\d{4}[-\s]?\d{4}[-\s]?\d{2}\b/)?.[0] ??
    headerCompact.match(/(?:PERIODCOVERED.*?NO|ACCOUNT(?:NO|NUMBER|#)|ACCT(?:NO|NUMBER|#)|A\/C(?:NO|NUMBER|#)|NO):?([0-9-]{8,})/i)?.[1] ??
    headerCompact.match(/NO:([0-9-]{8,})/i)?.[1] ??
    cardAccountMatch ??
    "";
  const accountNumber =
    (/^BE\d{8}$/i.test(accountSection) ? accountSection.toUpperCase() : null) ||
    accountSection.replace(/\D/g, "").slice(0, 16) ||
    null;
  const accountName = accountNumber ? `BPI ${accountNumber.slice(-4)}` : "BPI";

  const periodMatch =
    compactWhitespace(normalized).match(/(?:ACCOUNTSUMMARYFORTHEPERIOD|PERIODCOVERED|FORTHEPERIOD)(?:.*?)([A-Z]{3}\d{1,2},?\d{4})[-–—]([A-Z]{3}\d{1,2},?\d{4})/i) ??
    normalized.match(/PERIOD\s*COVERED\s*[:\-]?\s*([A-Z]{3}\s*\d{1,2}\s*,\s*\d{4})\s*[–—-]\s*([A-Z]{3}\s*\d{1,2}\s*,\s*\d{4})/i) ??
    headerCompact.match(/PERIODCOVERED(?:.*?)([A-Z]{3}\d{1,2},\d{4})[-–—]([A-Z]{3}\d{1,2},\d{4})/i) ??
    normalized.match(/PERIOD\s*COVERED\s+([A-Z]{3}\s+\d{1,2}\s*,?\s*\d{4})\s*(?:TO|THRU|THROUGH|[-–—])\s*([A-Z]{3}\s+\d{1,2}\s*,?\s*\d{4})/i);
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
    accountType: "bank",
    openingBalance,
    endingBalance,
    startDate: startDate ? startDate.toISOString() : null,
    endDate: endDate ? endDate.toISOString() : null,
    confidence: accountNumber ? 95 : 85,
  };
};

const guessBpiCreditCategoryName = (description: string, type: TransactionType) => {
  const lower = description.toLowerCase();
  const compact = lower.replace(/[^a-z0-9]+/g, "");
  if (compact.includes("paymentthankyou") || compact.includes("cardpayment") || type === "transfer") return "Transfers";
  if (/transfer|instapay|pesonet/.test(lower)) return "Transfers";
  if (/taxwithheld|withheldtax|tax withheld|withheld tax/.test(lower)) return "Financial";
  if (/instapay transfer fee|instapaytransferfee|transfer fee|transferfee/.test(lower)) return "Transfers";
  if (/service charge|bank charge|dhl duty collection/.test(lower)) return "Financial";
  if (/bill|meralco|bayad center|payment/.test(lower)) return "Bills & Utilities";
  if (/grab|uber|taxi|bus|train|mrt|mrt3|dotr|parking|gas|fuel|transport|ride/.test(lower)) return "Transport";
  if (/food|dining|restaurant|cafe|coffee|japanese|pho hoa|burnt bean|jung one|kiyosa/.test(lower)) return "Food & Dining";
  if (/shop|shopping|mall|amazon|lazada|shopee|zalora|watsons|iherb|retail/.test(lower)) return "Shopping";
  if (/health|doctor|clinic|pharmacy|medical|hospital|classpass/.test(lower)) return "Health & Wellness";
  if (/business|invoice|client|contract|linkedin|canva/.test(lower)) return "Business";
  if (/travel|airbnb|hotel|airline|flight|tour|holiday|paypal \*getyourguid|paypal \*trenitalias|paypal \*transfeero|paypal \*amami/.test(lower))
    return "Travel & Lifestyle";
  if (/fee|interest|loan|financial|bank charge/.test(lower)) return "Financial";
  return guessCategoryName(description, type);
};

const parseBpiCreditCardTransactionLine = (
  line: string,
  state: {
    year: number;
    accountName: string;
    institution: string | null;
    statementDate: string | null;
    paymentDueDate: string | null;
  }
) => {
  const normalized = normalizeWhitespace(line);
  const tokens = normalized.split(" ");
  const saleDateResult = parseBpiCardDateToken(tokens, 0, state.year);
  if (!saleDateResult) {
    return null;
  }

  const postDateResult = parseBpiCardDateToken(tokens, saleDateResult.nextIndex, state.year);
  if (!postDateResult) {
    return null;
  }

  const body = tokens.slice(postDateResult.nextIndex).join(" ").trim();
  if (!body) {
    return null;
  }

  const moneyMatches = body.match(/-?[0-9][0-9,]*\.\d{2}/g) ?? [];
  const amountText = moneyMatches.at(-1) ?? null;
  const amount = parseMoney(amountText);
  if (amount === null) {
    return null;
  }

  const currencyMatch = body.match(/\b((?:U\s*S\.?\s*Dollar|U\.?\s*S\.?\s*Dollar|U\s*S|U\.?\s*S\.?|Baht|THB|USD|EUR|GBP|SGD|JPY|HKD|PHP|Philippine Peso))\s+(-?[0-9][0-9,]*\.\d{2})/i);
  const foreignAmountText = currencyMatch?.[2] ?? (moneyMatches.length > 1 ? moneyMatches[moneyMatches.length - 2] : null);
  const fxNote = currencyMatch?.[1] && foreignAmountText ? `${normalizeWhitespace(currencyMatch[1]).replace(/\s+/g, " ")} ${Math.abs(parseMoney(foreignAmountText) ?? 0).toFixed(2)}` : null;

  let descriptionSource = body
    .replace(/-?[0-9][0-9,]*\.\d{2}/g, " ")
    .replace(/\b((?:U\s*S\.?\s*Dollar|U\.?\s*S\.?\s*Dollar|U\s*S|U\.?\s*S\.?|Baht|THB|USD|EUR|GBP|SGD|JPY|HKD|PHP|Philippine Peso))\b/gi, " ")
    .replace(/\s*\/\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!descriptionSource) {
    return null;
  }

  const descriptionLower = descriptionSource.toLowerCase();
  let type: TransactionType = "expense";
  const descriptionCompact = descriptionLower.replace(/[^a-z0-9]+/g, "");
  if (descriptionCompact.includes("paymentthankyou") || descriptionCompact.includes("cardpayment")) {
    type = "transfer";
  } else if (/refund|reversal|credit memo|cashback|cash back/.test(descriptionLower)) {
    type = "income";
  }

  const merchantRaw = humanizeMerchantText(descriptionSource);
  const merchantClean = summarizeMerchantText(descriptionSource, state.institution);
  const categoryName = guessBpiCreditCategoryName(descriptionSource, type);

  return {
    date: postDateResult.date.toISOString().slice(0, 10),
    amount: Math.abs(amount).toFixed(2),
    merchantRaw,
    merchantClean,
    description: descriptionSource,
    categoryName,
    accountName: state.accountName,
    institution: state.institution ?? undefined,
    type,
    rawPayload: {
      bank: "BPI",
      accountName: state.accountName,
      accountNumber: "9001",
      statementDate: state.statementDate,
      paymentDueDate: state.paymentDueDate,
      saleDate: saleDateResult.date.toISOString().slice(0, 10),
      postDate: postDateResult.date.toISOString().slice(0, 10),
      amountText,
      foreignAmountText,
      fxNote,
      line: normalized,
      notes: fxNote || (/payment\s*-\s*thank you|payment\s+thank you|card payment/.test(descriptionLower) ? "Statement payment credit" : null),
    },
  } satisfies ParsedImportRow;
};

const parseBpiCreditCardImportText = (text: string) => {
  const normalizedText = normalizeBpiText(text);
  const metadata = bpiCreditCardStatementMetadata(normalizedText);
  if (!metadata) {
    return null;
  }

  const lines = normalizedText
    .split(/\r?\n/)
    .map((line) => collapseBpiCreditCardOcrLine(line))
    .filter(Boolean);

  const startYear = metadata.startDate ? new Date(metadata.startDate).getUTCFullYear() : metadata.endDate ? new Date(metadata.endDate).getUTCFullYear() : new Date().getUTCFullYear();
  const segments: string[][] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (isBpiCreditCardBoilerplateLine(line)) {
      if (current.length > 0) {
        segments.push(current);
        current = [];
      }
      continue;
    }

    if (isBpiCreditCardTransactionStartLine(line)) {
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
    .map((segment) =>
      parseBpiCreditCardSegment(segment, {
        year: startYear,
        accountName: metadata.accountName ?? formatSimpleBankAccountName("BPI", metadata.accountNumber?.slice(-4) ?? "9001"),
        accountNumber: metadata.accountNumber ?? null,
        institution: metadata.institution ?? "BPI",
        statementDate: metadata.startDate,
        paymentDueDate: metadata.endDate,
      })
    )
    .filter(Boolean) as ParsedImportRow[];

  if (rows.length === 0) {
    return null;
  }

  return {
    metadata,
    rows,
  };
};

const collapseBpiCreditCardOcrLine = (line: string) => {
  const normalized = normalizeWhitespace(line);
  if (!normalized) {
    return normalized;
  }

  const tokens = normalized.split(" ");
  const singleCharacterTokens = tokens.filter((token) => /^[A-Za-z0-9.,()\-\/]$/.test(token)).length;
  const looksCharacterSpaced = tokens.length >= 6 && singleCharacterTokens / tokens.length >= 0.75;
  return looksCharacterSpaced ? tokens.join("") : normalized;
};

const isBpiCreditCardBoilerplateLine = (line: string) => {
  const compact = collapseBpiCreditCardOcrLine(line).replace(/\s+/g, "").toUpperCase();
  return (
    compact === "PREPAREDFOR" ||
    compact.startsWith("REFERENCENO") ||
    compact.startsWith("CUSTOMERNUMBER") ||
    compact.startsWith("STATEMENTDATE") ||
    compact.startsWith("PAYMENTDUEDATE") ||
    compact.startsWith("CREDITLIMIT") ||
    compact.startsWith("TOTALAMOUNTDUE") ||
    compact.startsWith("MINIMUMAMOUNTDUE") ||
    compact.startsWith("STATEMENTOFACCOUNT") ||
    compact.startsWith("TRANSACTIONPOSTDATEDESCRIPTIONAMOUNT") ||
    compact === "DATE" ||
    compact.startsWith("FINANCECHARGE") ||
    compact.startsWith("PREVIOUSBALANCE") ||
    compact.startsWith("PASTDUE") ||
    compact.startsWith("ENDINGBALANCE") ||
    compact.startsWith("UNBILLEDINSTALLMENTAMOUNT") ||
    compact.startsWith("TOTALOUTSTANDINGBALANCE") ||
    compact === "REWARDS" ||
    compact.includes("BPIPOINTS") ||
    compact.startsWith("BPISIGNATURECARD") ||
    compact.includes("BALANCESUMMARY") ||
    compact.includes("TRANSACTIONLASTPAYMENTDESCRIPTIONPURCHASEAMOUNTREMAININGDATEBALANCE") ||
    compact.includes("SIPBALANCESUMMARY")
  );
};

const isBpiCreditCardTransactionStartLine = (line: string) => {
  const compact = collapseBpiCreditCardOcrLine(line).replace(/\s+/g, "");
  const dateTokenPattern = `(?:${monthNamePattern}\\d{1,2}|\\d{1,2}${monthNamePattern})(?:,?\\d{4})?`;
  return new RegExp(`^${dateTokenPattern}${dateTokenPattern}`, "i").test(compact);
};

const parseBpiCreditCardSegment = (
  segmentLines: string[],
  state: {
    year: number;
    accountName: string;
    accountNumber: string | null;
    institution: string | null;
    statementDate: string | null;
    paymentDueDate: string | null;
  }
) => {
  if (segmentLines.length === 0) {
    return null;
  }

  const segmentText = segmentLines.map((line) => collapseBpiCreditCardOcrLine(line)).join(" ").trim();
  const compact = segmentText.replace(/\s+/g, "");
  const dateTokenPattern = `(?:${monthNamePattern}\\d{1,2}|\\d{1,2}${monthNamePattern})(?:,?\\d{4})?`;
  const match = compact.match(new RegExp(`^(${dateTokenPattern})(${dateTokenPattern})(.+)$`, "i"));
  if (!match) {
    return null;
  }

  const saleDate = parseBpiDate(match[1], state.year);
  const postDate = parseBpiDate(match[2], state.year);
  if (!saleDate || !postDate) {
    return null;
  }

  const body = match[3];
  const moneyMatches = body.match(/-?[0-9][0-9,]*\.\d{2}/g) ?? [];
  const amountText = moneyMatches.at(-1) ?? null;
  const amount = parseMoney(amountText);
  if (amount === null) {
    return null;
  }

  const currencyLabelMatch = body.match(/(?:USDollar|Baht|THB|USD|EUR|GBP|SGD|JPY|HKD|Philippine\s*Peso)/i);
  const foreignAmountText = moneyMatches.length > 1 ? moneyMatches[moneyMatches.length - 2] : null;
  const formatCurrencyLabel = (label: string) =>
    label
      .replace(/USDollar/i, "U.S. Dollar")
      .replace(/Philippine\s*Peso/i, "Philippine Peso")
      .replace(/\s+/g, " ");
  const fxNote = currencyLabelMatch && foreignAmountText
    ? `${formatCurrencyLabel(currencyLabelMatch[0])} ${Math.abs(parseMoney(foreignAmountText) ?? 0).toFixed(2)}`
    : null;

  const amountIndex = amountText ? body.lastIndexOf(amountText) : -1;
  let descriptionSource = amountIndex >= 0 ? body.slice(0, amountIndex) : body;
  if (currencyLabelMatch && foreignAmountText) {
    const fxPattern = new RegExp(
      `${currencyLabelMatch[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*${foreignAmountText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
      "i"
    );
    descriptionSource = descriptionSource.replace(fxPattern, " ");
  }
  descriptionSource = descriptionSource
    .replace(/-?[0-9][0-9,]*\.\d{2}/g, " ")
    .replace(/\s*\/\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!descriptionSource) {
    return null;
  }

  const descriptionLower = descriptionSource.toLowerCase();
  let type: TransactionType = "expense";
  const descriptionCompact = descriptionLower.replace(/[^a-z0-9]+/g, "");
  if (descriptionCompact.includes("paymentthankyou") || descriptionCompact.includes("cardpayment")) {
    type = "transfer";
  } else if (/refund|reversal|credit memo|cashback|cash back/.test(descriptionLower)) {
    type = "income";
  }

  const merchantRaw = humanizeMerchantText(descriptionSource);
  const merchantClean = summarizeMerchantText(descriptionSource, state.institution);
  const categoryName = guessBpiCreditCategoryName(descriptionSource, type);

  return {
    date: postDate.toISOString().slice(0, 10),
    amount: Math.abs(amount).toFixed(2),
    merchantRaw,
    merchantClean,
    description: descriptionSource,
    categoryName,
    accountName: state.accountName,
    institution: state.institution ?? undefined,
    type,
    rawPayload: {
      bank: "BPI",
      accountName: state.accountName,
      accountNumber: state.accountNumber ?? state.accountName.replace(/\D/g, "").slice(-4) ?? null,
      statementDate: state.statementDate,
      paymentDueDate: state.paymentDueDate,
      saleDate: saleDate.toISOString().slice(0, 10),
      postDate: postDate.toISOString().slice(0, 10),
      amountText,
      foreignAmountText,
      fxNote,
      line: segmentText,
      notes: fxNote || (descriptionCompact.includes("paymentthankyou") || descriptionCompact.includes("cardpayment") ? "Statement payment credit" : null),
    },
  } satisfies ParsedImportRow;
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
    institution: string | null;
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
    merchantClean: summarizeMerchantText(description, state.institution),
    description,
    categoryName,
    accountName: state.accountName,
    institution: state.institution ?? undefined,
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
    return null;
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
      institution: metadata.institution ?? "RCBC",
    });

    if (parsed) {
      rows.push(parsed);
    }
  }

  if (!rows.some((row) => /cash payment/i.test(String(row.description ?? row.merchantRaw ?? "")))) {
    const cashPaymentLine = lines
      .slice(headerIndex + 1, endIndex)
      .find((line) => /cash\s+payment/i.test(line) && /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(line));
    if (cashPaymentLine) {
      const cashPaymentMatch =
        cashPaymentLine.match(/^(\d{2}\/\d{2}\/\d{2})\s+(\d{2}\/\d{2}\/\d{2})\s+CASH PAYMENT\s+([0-9][0-9,]*\.\d{2}-?)$/i) ??
        cashPaymentLine.match(/^(\d{2}\/\d{2}\/\d{2})\s+(\d{2}\/\d{2}\/\d{2})\s+(.+?)\s+([0-9][0-9,]*\.\d{2}-?)$/i);
      const parsed = cashPaymentMatch
        ? (() => {
            const saleDate = parseDateValue(cashPaymentMatch[1]);
            const postDate = parseDateValue(cashPaymentMatch[2]);
            const description = normalizeWhitespace(cashPaymentMatch[3]);
            const amountText = cashPaymentMatch[4];
            const amount = parseMoney(amountText);
            if (!saleDate || amount === null) {
              return null;
            }

            const type: TransactionType = "transfer";
            return {
              date: saleDate.toISOString().slice(0, 10),
              amount: amount.toFixed(2),
              merchantRaw: humanizeMerchantText(description),
              merchantClean: summarizeMerchantText(description, metadata.institution ?? "RCBC"),
              description,
              categoryName: guessRcbcCategoryName(description, type),
              accountName: metadata.accountName ?? "RCBC",
              institution: metadata.institution ?? undefined,
              type,
              rawPayload: {
                bank: "RCBC",
                cardNumber: metadata.accountNumber,
                saleDate: saleDate.toISOString().slice(0, 10),
                postDate: postDate ? postDate.toISOString().slice(0, 10) : null,
                amountText,
                line: cashPaymentLine,
              },
            } satisfies ParsedImportRow;
          })()
        : null;
      if (parsed) {
        rows.push(parsed);
      }
    }
  }

  return {
    metadata,
    rows,
  };
};

const normalizeBdoText = (text: string) =>
  text
    .replace(/\u00a0/g, " ")
    .split(/\r?\n/)
    .map((line) => {
      const normalized = decompactOcrText(line);
      if (!normalized) {
        return normalized;
      }

      const tokens = normalizeWhitespace(normalized).split(" ");
      const singleCharacterTokens = tokens.filter((token) => /^[A-Za-z0-9,.-]$/.test(token)).length;
      const looksCharacterSpaced = tokens.length >= 6 && singleCharacterTokens / tokens.length >= 0.65;
      const collapsed = looksCharacterSpaced ? tokens.join("") : normalized;
      return normalizeWhitespace(decompactOcrText(collapsed));
    })
    .join("\n");

const detectBdoAccountNumberFromText = (text: string) => {
  const normalized = normalizeBdoText(text);
  const compact = compactWhitespace(normalized);
  const lines = normalized.split(/\r?\n/).map((line) => normalizeWhitespace(line)).filter(Boolean);
  const accountLabelPattern =
    /(?:ACCOUNT\s*(?:NBR|NO\.?|NUMBER|#)|ACCT\s*(?:NBR|NO\.?|NUMBER|#)|A\/C\s*(?:NBR|NO\.?|NUMBER|#)|CARD\s*(?:NO\.?|NUMBER|#)|ACCOUNT\s+SUMMARY|NO)\s*[:\-]?\s*(\d[\d\s-]{6,})/i;
  const bdoNumberPattern = /\b(?:\d{3}[-\s]?\d{4}[-\s]?\d{3}[-\s]?\d{2}|\d{4}[-\s]?\d{4}[-\s]?\d{4})\b/;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const normalizedLine = line.replace(/^(?:\d+\s+)+/, "");
    if (
      !/(ACCOUNT|ACCT|A\/C|CARD)\s*(?:NBR|NO\.?|NUMBER|#)|\bNO\b/i.test(line) &&
      !/(ACCOUNT|ACCT|A\/C|CARD)\s*(?:NBR|NO\.?|NUMBER|#)|\bNO\b/i.test(normalizedLine) &&
      !/ACCOUNT\s+SUMMARY/i.test(line)
    ) {
      continue;
    }

    const directMatch = line.match(accountLabelPattern) ?? normalizedLine.match(accountLabelPattern);
    if (directMatch) {
      const digits = directMatch[1].replace(/\D/g, "").slice(0, 16);
      if (digits.length >= 8) {
        return digits;
      }
    }

    const numberMatch = line.match(bdoNumberPattern) ?? normalizedLine.match(bdoNumberPattern);
    if (numberMatch) {
      const digits = numberMatch[0].replace(/\D/g, "").slice(0, 16);
      if (digits.length >= 8) {
        return digits;
      }
    }

    const followingLine = lines[index + 1] ?? "";
    const followingNumberMatch = followingLine.match(bdoNumberPattern) ?? followingLine.match(accountLabelPattern);
    if (followingNumberMatch) {
      const digits = followingNumberMatch[0].replace(/\D/g, "").slice(0, 16);
      if (digits.length >= 8) {
        return digits;
      }
    }

    const currentDigits = line.replace(/[^0-9]/g, "");
    if (currentDigits.length >= 8 && currentDigits.length <= 16) {
      const candidate = currentDigits.slice(0, 16);
      if (!/(?:\d{8,})\d{2,}$/i.test(candidate) || candidate.length <= 12) {
        return candidate;
      }
    }

    if (/ACCOUNT\s+SUMMARY/i.test(line) || /ACCOUNT\s+NUMBER/i.test(line)) {
      const combinedDigits = `${line} ${followingLine}`
        .replace(/[^0-9]/g, "")
        .slice(0, 12);
      if (combinedDigits.length >= 8) {
        return combinedDigits;
      }
    }
  }

  const accountNbrHeadingIndex = lines.findIndex((line) => {
    const lineCompact = compactWhitespace(line).replace(/\s+/g, "");
    return /^ACCOUNT(?:NBR|NO\.?|NUMBER|#)/i.test(line) || /^ACCOUNT(?:NBR|NO\.?|NUMBER|#)/i.test(lineCompact);
  });
  if (accountNbrHeadingIndex >= 0) {
    const headingWindow = lines.slice(accountNbrHeadingIndex, accountNbrHeadingIndex + 5);
    const joinedDigits = headingWindow.map((line) => line.replace(/[^0-9]/g, "")).join("");
    if (joinedDigits.length >= 8) {
      return joinedDigits.slice(0, 16);
    }
  }

  const labeledPatterns = [
    /ACCOUNT\s*(?:NBR|NO\.?|NUMBER|#)\s*[:\-]?\s*([0-9][0-9\s-]{5,})/i,
    /ACCOUNT\s+SUMMARY\s*([0-9][0-9\s-]{5,})/i,
  ];

  for (const pattern of labeledPatterns) {
    const match = normalized.match(pattern)?.[1];
    if (match) {
      const digits = match.replace(/\D/g, "").slice(0, 16);
      if (digits) {
        return digits;
      }
    }
  }

  const accountHeadingIndex = lines.findIndex((line) => /^ACCOUNT\s*(?:NBR|NO\.?|NUMBER|#|SUMMARY)\b/i.test(line));
  if (accountHeadingIndex >= 0) {
    const headingWindow = lines.slice(accountHeadingIndex, accountHeadingIndex + 4);
    const windowDigits = headingWindow.map((line) => line.replace(/[^0-9]/g, "")).join("");
    if (windowDigits.length >= 8) {
      return windowDigits.slice(0, 16);
    }

    for (const line of headingWindow) {
      const digits = line.replace(/[^0-9]/g, "");
      if (digits.length >= 8) {
        return digits.slice(0, 16);
      }
    }
  }

  const fallbackMatch = compact.match(/\b\d{1,4}[-\s]?\d{1,4}[-\s]?\d{1,4}[-\s]?\d{1,4}\b/);
  if (fallbackMatch) {
    const digits = fallbackMatch[0].replace(/\D/g, "");
    if (digits.length >= 8) {
      return digits.slice(0, 16);
    }
  }

  return null;
};

const parseBdoDate = (
  value: string,
  metadata: Pick<DetectedStatementMetadata, "startDate" | "endDate">
) => {
  const normalized = normalizeWhitespace(value).replace(/\./g, "");
  const dayMonthMatch = normalized.match(new RegExp(`^(\\d{1,2})\\s+(${monthNamePattern})(?:,?\\s*(\\d{4}))?$`, "i"));
  if (dayMonthMatch) {
    const monthIndex = monthIndexByAbbr[dayMonthMatch[2].slice(0, 3).toUpperCase()];
    if (monthIndex !== undefined) {
      const start = metadata.startDate ? new Date(metadata.startDate) : null;
      const end = metadata.endDate ? new Date(metadata.endDate) : null;
      let year = end?.getUTCFullYear() ?? start?.getUTCFullYear() ?? new Date().getUTCFullYear();
      if (start && end && start.getUTCFullYear() !== end.getUTCFullYear()) {
        const endMonth = end.getUTCMonth();
        const endDay = end.getUTCDate();
        year = monthIndex > endMonth || (monthIndex === endMonth && Number(dayMonthMatch[1]) > endDay)
          ? start.getUTCFullYear()
          : end.getUTCFullYear();
      } else if (dayMonthMatch[3]) {
        year = Number(dayMonthMatch[3]);
      }
      return new Date(Date.UTC(year, monthIndex, Number(dayMonthMatch[1]), 12));
    }
  }

  const numericMatch = normalized.match(/^(\d{1,2})[-/](\d{1,2})(?:[-/](\d{2,4}))?$/);
  if (numericMatch) {
    const month = Number(numericMatch[1]) - 1;
    const day = Number(numericMatch[2]);
    const start = metadata.startDate ? new Date(metadata.startDate) : null;
    const end = metadata.endDate ? new Date(metadata.endDate) : null;
    let year = end?.getUTCFullYear() ?? start?.getUTCFullYear() ?? new Date().getUTCFullYear();
    if (start && end && start.getUTCFullYear() !== end.getUTCFullYear()) {
      const endMonth = end.getUTCMonth();
      const endDay = end.getUTCDate();
      year = month > endMonth || (month === endMonth && day > endDay)
        ? start.getUTCFullYear()
        : end.getUTCFullYear();
    } else if (numericMatch[3]) {
      year = Number(numericMatch[3].length === 2 ? `20${numericMatch[3]}` : numericMatch[3]);
    }
    return new Date(Date.UTC(year, month, day, 12));
  }

  const monthDayMatch = normalized.match(new RegExp(`^(${monthNamePattern})\\s+(\\d{1,2})(?:,?\\s*(\\d{4}))?$`, "i"));
  if (monthDayMatch) {
    const monthIndex = monthIndexByAbbr[monthDayMatch[1].slice(0, 3).toUpperCase()];
    if (monthIndex !== undefined) {
      const start = metadata.startDate ? new Date(metadata.startDate) : null;
      const end = metadata.endDate ? new Date(metadata.endDate) : null;
      let year = end?.getUTCFullYear() ?? start?.getUTCFullYear() ?? new Date().getUTCFullYear();
      if (start && end && start.getUTCFullYear() !== end.getUTCFullYear()) {
        const endMonth = end.getUTCMonth();
        const endDay = end.getUTCDate();
        year = monthIndex > endMonth || (monthIndex === endMonth && Number(monthDayMatch[2]) > endDay)
          ? start.getUTCFullYear()
          : end.getUTCFullYear();
      } else if (monthDayMatch[3]) {
        year = Number(monthDayMatch[3]);
      }
      return new Date(Date.UTC(year, monthIndex, Number(monthDayMatch[2]), 12));
    }
  }

  const parsed = parseDateValue(normalized);
  if (parsed) {
    return parsed;
  }

  const parsedLoose = new Date(normalized);
  return Number.isNaN(parsedLoose.getTime()) ? null : parsedLoose;
};

const bdoStatementMetadata = (text: string): DetectedStatementMetadata | null => {
  const normalized = normalizeBdoText(text);
  const compact = normalizeWhitespace(normalized);
  if (!/\bBDO\b|\bBANCO\s+DE\s+ORO\b/i.test(compact) && !/ACCOUNT\s+(?:NBR|NO\.?|NUMBER|SUMMARY)/i.test(compact)) {
    return null;
  }

  const lines = normalized.split(/\r?\n/).map((line) => normalizeWhitespace(line)).filter(Boolean);
  const accountNumber = detectBdoAccountNumberFromText(normalized) ?? detectAccountNumberFromText(normalized);
  const accountName = accountNumber ? formatSimpleBankAccountName("BDO", accountNumber) : "BDO";

  const periodLine =
    lines.find((line) => /BAL\s+AS\s+OF/i.test(line)) ??
    lines.find((line) => /^FOR\s+/i.test(line)) ??
    lines.find((line) => /STATEMENT\s+PERIOD\s+ENDING/i.test(line)) ??
    null;

  let startDate: Date | null = null;
  let endDate: Date | null = null;
  if (periodLine) {
    const asOfMatch = periodLine.match(/BAL\s+AS\s+OF\s+(.+?)\s+TO\s+(.+)$/i);
    const forMatch = periodLine.match(/^FOR\s+(.+?)\s*[-–—]\s*(.+)$/i);
    const endingMatch = periodLine.match(/STATEMENT\s+PERIOD\s+ENDING\s*[:\-]?\s*(.+)$/i);

    if (asOfMatch) {
      endDate = parseBdoDate(asOfMatch[2], { startDate: null, endDate: null });
      startDate = parseBdoDate(asOfMatch[1], {
        startDate: null,
        endDate: endDate ? endDate.toISOString() : null,
      });
    } else if (forMatch) {
      endDate = parseBdoDate(forMatch[2], { startDate: null, endDate: null });
      startDate = parseBdoDate(forMatch[1], {
        startDate: null,
        endDate: endDate ? endDate.toISOString() : null,
      });
    } else if (endingMatch) {
      endDate = parseBdoDate(endingMatch[1], { startDate: null, endDate: null });
    }
  }

  const openProcMatch = compact.match(/OPEN\/PROC\s+THRU\s+(\d{1,2}-\d{1,2}-\d{2,4})\s+(\d{1,2}-\d{1,2}-\d{2,4})/i);
  if (openProcMatch) {
    startDate = parseBdoDate(openProcMatch[1], {
      startDate: null,
      endDate: endDate ? endDate.toISOString() : null,
    });
    endDate = parseBdoDate(openProcMatch[2], {
      startDate: startDate ? startDate.toISOString() : null,
      endDate: null,
    });
  }

  const previousBalance =
    parseMoney(compact.match(/PREVIOUS\s+BALANCE\s*[:\-]?\s*([0-9,]+\.\d{2})/i)?.[1] ?? null) ??
    parseMoney(compact.match(/BAL\s+AS\s+OF\s+[^\n]+?([0-9,]+\.\d{2})/i)?.[1] ?? null);
  const headerCurrentBalance =
    parseMoney(compact.match(/\bCURRENT\s+([0-9,]+\.\d{2})/i)?.[1] ?? null) ??
    parseMoney(compact.match(/\bAVAIL\s+TODAY\s+([0-9,]+\.\d{2})/i)?.[1] ?? null) ??
    parseMoney(compact.match(/\bTOMORROW\s+([0-9,]+\.\d{2})/i)?.[1] ?? null) ??
    parseMoney(compact.match(/\bMEMO\s+([0-9,]+\.\d{2})/i)?.[1] ?? null);
  const currentBalance =
    headerCurrentBalance ??
    parseMoney(compact.match(/\bCUR(?:RENT)?\s+BALANCE\s*([0-9,]+\.\d{2})/i)?.[1] ?? null) ??
    parseMoney(compact.match(/\bBALANCE\s+P?\s*([0-9,]+\.\d{2})/i)?.[1] ?? null);
  const endingBalance =
    parseMoney(compact.match(/ENDING\s+BALANCE\s*[:\-]?\s*([0-9,]+\.\d{2})/i)?.[1] ?? null) ??
    parseMoney(compact.match(/CLOSING\s+BALANCE(?:\s+TOTAL)?\s*([0-9,]+\.\d{2})/i)?.[1] ?? null) ??
    currentBalance;

  return {
    institution: "BDO",
    accountNumber,
    accountName,
    accountType: "bank",
    openingBalance: previousBalance,
    endingBalance,
    startDate: startDate ? startDate.toISOString() : null,
    endDate: endDate ? endDate.toISOString() : null,
    confidence: accountNumber ? 93 : 82,
  };
};

const isBdoBoilerplateLine = (line: string) => {
  const normalized = normalizeWhitespace(line);
  const compact = normalized.replace(/\s+/g, " ").trim();
  return (
    /^ACCOUNT\s*(?:NBR|NO\.?|NUMBER|SUMMARY)\b/i.test(compact) ||
    /^CURRENCY\s+CODE/i.test(compact) ||
    /^SHORT\s+NAME/i.test(compact) ||
    /^CUSTOMER\s+DATA/i.test(compact) ||
    /^ADDRESS/i.test(compact) ||
    /^PAGE\s+\d+/i.test(compact) ||
    /^BDO\s+UNIBANK/i.test(compact) ||
    /^SWIFT\s+CODE/i.test(compact) ||
    /^TEL\s+/i.test(compact) ||
    /^WE\s+FIND\s+WAYS/i.test(compact) ||
    /^FOR\s+[A-Za-z]{3}\s+\d{1,2}[-–—]\s*[A-Za-z]{3}\s+\d{1,2},?\s+\d{4}$/i.test(compact) ||
    /^STATEMENT\s+PERIOD\s+ENDING/i.test(compact) ||
    /^DATE\s+DESCRIPTION\s+REF\s+DETAILS/i.test(compact) ||
    /^SEL\s+POST\s+EFF\s+TC\s+DESCRIPTION\s+AMOUNT\s+BALANCE/i.test(compact) ||
    /^BEGINNING\s+BALANCE$/i.test(compact) ||
    /^ENDING\s+BALANCE$/i.test(compact) ||
    /^CLOSING\s+BALANCE(?:\s+TOTAL)?$/i.test(compact) ||
    /^PREVIOUS\s+BALANCE$/i.test(compact) ||
    /^BALANCE$/i.test(compact) ||
    /^AVAIL\s+TODAY$/i.test(compact) ||
    /^TOMORROW$/i.test(compact) ||
    /^MEMO$/i.test(compact) ||
    /^WITHDRAWALS$/i.test(compact) ||
    /^DEPOSITS$/i.test(compact) ||
    /^DEBIT$/i.test(compact) ||
    /^CREDIT$/i.test(compact) ||
    /^F\s+\d+\s*=+/i.test(compact) ||
    /^EXIT$/i.test(compact) ||
    /^CANCEL$/i.test(compact) ||
    /^FIRST\/LAST$/i.test(compact) ||
    /^FOLD\/UNFOLD$/i.test(compact) ||
    /^PRINT\s+STMT$/i.test(compact) ||
    /^RELOAD\s+ENTERPRISE\s+DESCRIPTION$/i.test(compact) ||
    /^BALANCE\s+DATA$/i.test(compact) ||
    /^ACCOUNT\s+DATA$/i.test(compact) ||
    /^ACTIVITY\/INTEREST\s+DATA$/i.test(compact) ||
    /^ATTN\s+FLAGS$/i.test(compact) ||
    /^PRODUCT\s+TYPE$/i.test(compact) ||
    /^RELATIONSHIP\s+CODE$/i.test(compact) ||
    /^OD\s+LIMIT\/TOD\/ACA$/i.test(compact) ||
    /^UNCLEARED\s+LIMIT$/i.test(compact) ||
    /^EFT\s+CARD\s+CODE$/i.test(compact) ||
    /^ACCOUNT\s+STATUS$/i.test(compact) ||
    /^[A-Z]{2,4}\s*$/i.test(compact) ||
    /^\d{4}$/i.test(compact) ||
    /^0{3,}$/i.test(compact)
  );
};

const isBdoTransactionStartLine = (line: string) => {
  const normalized = normalizeWhitespace(line);
  const compact = normalized.replace(/\s+/g, " ");
  return (
    /^(?:-?\s*)?(?:\d{1,2}[-/]\d{1,2}(?:[-/]\d{2,4})?|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,?\s*\d{4})?)/i.test(
      compact
    ) || /^(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4}/i.test(compact)
  );
};

const cleanupBdoDescription = (value: string) =>
  normalizeWhitespace(
    decompactOcrText(value)
      .replace(/\b(?:JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER|JAN|FEB|MAR|APR|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)\b\s+\d{1,2}(?:,\s*\d{4})?/gi, " ")
      .replace(/\b\d{1,2}[-/]\d{1,2}(?:[-/]\d{2,4})?\b/g, " ")
      .replace(/\b\d{3,4}\b/g, " ")
      .replace(/\bP\b/gi, " ")
      .replace(/-?\d[\d,]*\.\d{2}/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );

const guessBdoCategoryName = (description: string, type: TransactionType) => {
  const lower = description.toLowerCase();
  if (/interest/.test(lower)) return "Income";
  if (/salary|payroll/.test(lower)) return "Income";
  if (/service\s+charge|tax|withheld|fee|charge/.test(lower)) return "Financial";
  if (
    /deposit|received|funds\s+deposited|cash\s+deposit|\bcd\b|interbank\s+deposit|bank\s+transfer|fund\s+transfer|withdrawal|atm|cash\s+withdrawal|cw\b|w\/d|wdrawal|pob\s+ibft/i.test(
      lower
    )
  ) {
    return "Transfers";
  }
  if (/merchant\s+payment|ma[_\s-]?pc/i.test(lower)) return "Shopping";
  return guessCategoryName(description, type);
};

const parseBdoSavingsTransactionBlock = (
  blockLines: string[],
  metadata: DetectedStatementMetadata
): ParsedImportRow | null => {
  const normalizedLines = blockLines.map((line) => normalizeWhitespace(decompactOcrText(line))).filter(Boolean);
  if (normalizedLines.length === 0) {
    return null;
  }

  const blockText = normalizedLines.join(" ");
  const dateSource =
    normalizedLines.find((line) => isBdoTransactionStartLine(line)) ??
    normalizedLines.find((line) => /\b(?:JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER|JAN|FEB|MAR|APR|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)\b/i.test(line)) ??
    blockText;

  const dateMatch =
    dateSource.match(/^(?:-?\s*)?(\d{1,2}[-/]\d{1,2})/) ??
    dateSource.match(new RegExp(`^(?:-?\\s*)?((?:${monthNamePattern})\\s+\\d{1,2})`, "i"));
  const date = dateMatch ? parseBdoDate(dateMatch[1], metadata) : null;
  if (!date) {
    return null;
  }

  const textCandidates = normalizedLines.filter(
    (line) =>
      /[A-Za-z]/.test(line) &&
      !isBdoBoilerplateLine(line) &&
      !/^\d{1,4}$/.test(line) &&
      !/^-?\s*\d[\d,]*\.\d{2}\s*P?$/i.test(line)
  );
  const descriptionSource = textCandidates.at(-1) ?? normalizedLines.at(0) ?? blockText;
  const notes = textCandidates.length > 1 ? textCandidates.slice(0, -1).join(" • ") : null;
  let description = cleanupBdoDescription(descriptionSource);
  if ((!description || !/[A-Za-z]/.test(description)) && normalizedLines.some((line) => /\bCW\b/i.test(line))) {
    description = "Cash Withdrawal";
  }
  if (
    (!description || !/[A-Za-z]/.test(description)) &&
    normalizedLines.some((line) => /\b(?:POB\s+IBFT|BANK\s+TRANSFER|FUND\s+TRANSFER|W\/?D\s+FR\s+SAV\s+BDO|ATM\s+WITHDRAWAL)\b/i.test(line))
  ) {
    description = "Bank Transfer";
  }
  if (!description || !/[A-Za-z]/.test(description)) {
    return null;
  }

  const moneyValues = Array.from(blockText.matchAll(/-?\d[\d,]*\.\d{2}/g))
    .map((match) => parseMoney(match[0]))
    .filter((value): value is number => value !== null);

  if (moneyValues.length === 0) {
    return null;
  }

  const signedAmount = moneyValues.find((value) => value < 0) ?? null;
  const sortedByAbs = [...moneyValues].sort((left, right) => Math.abs(left) - Math.abs(right));
  const amountValue = Math.abs(signedAmount ?? sortedByAbs[0]);
  const balanceValue = moneyValues.length > 1 ? Math.abs(sortedByAbs.at(-1) ?? amountValue) : null;

  const lower = description.toLowerCase();
  const type: TransactionType =
    /salary|payroll/.test(lower) || /interest/.test(lower)
      ? "income"
      : /service\s+charge|tax|withheld|fee|charge/.test(lower)
        ? "expense"
        : /deposit|received|funds\s+deposited|cash\s+deposit|\bcd\b|interbank\s+deposit|bank\s+transfer|fund\s+transfer|withdrawal|atm|cash\s+withdrawal|cw\b|w\/d|wdrawal|pob\s+ibft/i.test(
            lower
          )
          ? "transfer"
          : "expense";

  const categoryName = guessBdoCategoryName(description, type);

  return {
    date: date.toISOString().slice(0, 10),
    amount: amountValue.toFixed(2),
    merchantRaw: humanizeMerchantText(description),
    merchantClean: summarizeMerchantText(description, metadata.institution ?? "BDO"),
    description,
    categoryName,
    accountName: metadata.accountName ?? "BDO",
    institution: metadata.institution ?? undefined,
    type,
    rawPayload: {
      bank: "BDO",
      line: blockText,
      amountValues: moneyValues.map((value) => value.toFixed(2)),
      amountText: amountValue.toFixed(2),
      balanceText: balanceValue !== null ? balanceValue.toFixed(2) : null,
      notes,
    },
  } satisfies ParsedImportRow;
};

const parseBdoSavingsImportText = (text: string) => {
  const normalizedText = normalizeBdoText(text);
  const metadata = bdoStatementMetadata(normalizedText);
  if (!metadata) {
    return null;
  }

  const lines = normalizedText.split(/\r?\n/).map((line) => normalizeWhitespace(line)).filter(Boolean);
  const headerIndex = lines.findIndex(
    (line) =>
      /DATE\s+DESCRIPTION\s+REF\s+DETAILS\s+DEBIT\s+AMT\s+CREDIT\s+AMNT\s+BALANCE/i.test(line) ||
      /^EFF\s+TC\s+DESCRIPTION\s+AMOUNT\s+BALANCE/i.test(line) ||
      /SEL\s+POST\s+EFF\s+TC\s+DESCRIPTION\s+AMOUNT\s+BALANCE/i.test(line) ||
      /DATE\s+DETAILS\s+WITHDRAWALS\s+DEBIT\s+DEPOSITS\s+BALANCE/i.test(line) ||
      /DATE\s+DETAILS/i.test(line)
  );

  if (headerIndex < 0) {
    return null;
  }

  const transactionLines = lines.slice(headerIndex + 1);
  const blocks: string[][] = [];
  let current: string[] = [];

  for (const line of transactionLines) {
    if (isBdoBoilerplateLine(line)) {
      if (current.length > 0) {
        blocks.push(current);
        current = [];
      }
      continue;
    }

    if (isBdoTransactionStartLine(line)) {
      if (current.length > 0) {
        blocks.push(current);
      }
      current = [line];
      continue;
    }

    if (current.length > 0) {
      current.push(line);
    }
  }

  if (current.length > 0) {
    blocks.push(current);
  }

  const rows = blocks
    .map((block) => parseBdoSavingsTransactionBlock(block, metadata))
    .filter(Boolean) as ParsedImportRow[];

  if (rows.length === 0) {
    return null;
  }

  const endingBalance = metadata.endingBalance ?? getTrailingBalanceFromParsedRows(rows) ?? parseMoney(rows.at(-1)?.rawPayload?.balanceText as string | null);

  return {
    metadata: {
      ...metadata,
      endingBalance,
      confidence: Math.min(100, metadata.confidence + (rows.length > 0 ? 4 : 0)),
    },
    rows,
  };
};

const gcashStatementMetadata = (text: string): DetectedStatementMetadata | null => {
  const normalized = text.replace(/\u00a0/g, " ");
  const compact = normalizeWhitespace(normalized);
  if (!/\bGCash Transaction History\b/i.test(compact)) {
    return null;
  }

  const gcashHeaderSignals = [
    /\bGCash Transaction History\b/i,
    /\bDate and Time\b/i,
    /\bDescription\b/i,
    /\bReference No\.?\b/i,
    /\bDebit\b/i,
    /\bCredit\b/i,
    /\bBalance\b/i,
    /\bSTARTING BALANCE\b/i,
  ].filter((pattern) => pattern.test(compact)).length;

  if (gcashHeaderSignals < 3) {
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
    accountType: "wallet",
    openingBalance,
    endingBalance: null,
    startDate: parseLooseDate(dateRangeMatch?.[1] ?? null)?.toISOString() ?? null,
    endDate: parseLooseDate(dateRangeMatch?.[2] ?? null)?.toISOString() ?? null,
    confidence: accountNumber ? 88 : 74,
  };
};

const extractGcashPhoneNumbers = (value: string) => Array.from(new Set(value.match(/\b09\d{9}\b/g) ?? []));

const getParsedRowBalance = (row: ParsedImportRow) => {
  if (!row.rawPayload || typeof row.rawPayload !== "object") {
    return NaN;
  }

  const balance = row.rawPayload.balance;
  return typeof balance === "number" ? balance : NaN;
};

const inferGcashAccountNumberFromRows = (rows: ParsedImportRow[], fallback?: string | null) => {
  const scores = new Map<string, number>();

  const bump = (value: string | null | undefined, points: number) => {
    if (!value) {
      return;
    }

    const digits = value.replace(/\D/g, "").slice(-11);
    if (digits.length !== 11 || !digits.startsWith("09")) {
      return;
    }

    scores.set(digits, (scores.get(digits) ?? 0) + points);
  };

  const fallbackDigits = fallback?.replace(/\D/g, "").slice(-11) ?? null;
  if (fallbackDigits && fallbackDigits.startsWith("09")) {
    bump(fallbackDigits, 2);
  }

  rows.forEach((row, index) => {
    const rawLine = String(
      (row.rawPayload && typeof row.rawPayload === "object" && typeof row.rawPayload.line === "string" && row.rawPayload.line) ||
        row.description ||
        row.merchantRaw ||
        ""
    );
    const numbers = extractGcashPhoneNumbers(rawLine);
    const balance = getParsedRowBalance(row);
    const previousBalance = index > 0 ? getParsedRowBalance(rows[index - 1]) : NaN;
    const balanceDelta = Number.isFinite(balance) && Number.isFinite(previousBalance) ? balance - previousBalance : null;

    const transferMatch = rawLine.match(/\bTransfer\s+from\s+(09\d{9})\s+to\s+(09\d{9})\b/i);
    if (transferMatch) {
      const source = transferMatch[1];
      const destination = transferMatch[2];
      const transferDirection = balanceDelta !== null ? (balanceDelta > 0 ? "incoming" : "outgoing") : null;
      if (transferDirection === "incoming") {
        bump(destination, 6);
        bump(source, 2);
      } else if (transferDirection === "outgoing") {
        bump(source, 6);
        bump(destination, 2);
      } else {
        bump(source, 4);
        bump(destination, 4);
      }

      return;
    }

    if (/^Received GCash from/i.test(rawLine)) {
      numbers.forEach((number) => bump(number, 2));
      return;
    }

    if (/^Sent GCash to/i.test(rawLine)) {
      numbers.forEach((number) => bump(number, 2));
      return;
    }

    if (numbers.length === 1) {
      bump(numbers[0], 1);
    } else if (numbers.length > 1) {
      numbers.forEach((number) => bump(number, 1));
    }
  });

  const sorted = [...scores.entries()].sort((left, right) => right[1] - left[1]);
  const [bestNumber, bestScore] = sorted[0] ?? [];
  const secondScore = sorted[1]?.[1] ?? 0;

  if (!bestNumber || (bestScore ?? 0) < 3) {
    return fallback?.replace(/\D/g, "").slice(-11) ?? null;
  }

  if (bestScore !== undefined && bestScore - secondScore < 2 && fallbackDigits && fallbackDigits !== bestNumber) {
    return fallbackDigits;
  }

  return bestNumber;
};

const normalizeGcashMerchant = (description: string) => {
  let trimmed = decompactOcrText(description);

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

  trimmed = trimmed
    .replace(
      new RegExp(
        `^(?:(?:${monthNamePattern})\\s+\\d{1,2}\\s+){1,2}`,
        "i"
      ),
      ""
    )
    .replace(/^(?:\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+){1,2}/i, "")
    .replace(/^(?:\d{3,}\s+){1,2}/, "")
    .replace(/\s+\d[\d,]*\.\d{1,2}$/u, "")
    .trim();

  return trimmed;
};

const stripGcashRecordNoise = (value: string) => {
  const trimmed = normalizeWhitespace(value);
  if (!trimmed) {
    return "";
  }

  const headerMatch = trimmed.match(/^(.*?STARTING\s+BALANCE\s*[0-9,]+\.\d{2}\s+)(.+)$/i);
  if (headerMatch?.[2]) {
    return normalizeWhitespace(headerMatch[2]);
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

const parseGcashTransactionRecord = (record: string, institution?: string | null) => {
  const normalized = normalizeWhitespace(record);
  const match = normalized.match(
    /^(?<prefix>.*?)?(?<date>\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s+(?<meridian>AM|PM)\s*(?<body>.*?)\s+(?<reference>\d{10,})\s+(?<amount>\d[\d,]*\.\d{2})\s+(?<balance>\d[\d,]*\.\d{2})(?:\s+(?<suffix>.*))?$/
  );

  if (!match?.groups) {
    return null;
  }

  const description = normalizeWhitespace([match.groups.prefix, match.groups.body, match.groups.suffix].filter(Boolean).join(" "));
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
  const transferMatch = description.match(/\bTransfer\s+from\s+(09\d{9})\s+to\s+(09\d{9})\b/i);

  if (!date || amount === null) {
    return null;
  }

  return {
    date: date.toISOString().slice(0, 10),
    amount: amount.toFixed(2),
    merchantRaw: humanizeMerchantText(description),
    merchantClean: summarizeMerchantText(merchantClean, institution),
    description,
    categoryName,
    institution: institution ?? undefined,
    type,
    rawPayload: {
      bank: "GCash",
      referenceNo: match.groups.reference,
      amountText: match.groups.amount,
      balanceText: match.groups.balance,
      balance: parseMoney(match.groups.balance),
      transferFromAccountNumber: transferMatch?.[1] ?? null,
      transferToAccountNumber: transferMatch?.[2] ?? null,
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
  let pendingPrefix: string[] = [];

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

    const cleanedLine = stripGcashRecordNoise(line);
    if (!cleanedLine) {
      continue;
    }

    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\b/.test(cleanedLine)) {
      if (current.length > 0) {
        records.push(current.join(" "));
      }
      current = [...pendingPrefix, cleanedLine];
      pendingPrefix = [];
      continue;
    }

    if (current.length > 0) {
      current.push(cleanedLine);
    } else {
      pendingPrefix.push(cleanedLine);
    }
  }

  if (current.length > 0) {
    records.push(current.join(" "));
  }

  const rows = records
    .map((record) => parseGcashTransactionRecord(record, metadata.institution))
    .filter(Boolean) as ParsedImportRow[];

  const inferredAccountNumber = inferGcashAccountNumberFromRows(rows, metadata.accountNumber);
  const endingBalance = getTrailingBalanceFromParsedRows(rows);
  const accountNumber = inferredAccountNumber ?? metadata.accountNumber;

  return {
    metadata: {
      ...metadata,
      accountNumber,
      accountName: accountNumber ? `GCash ${accountNumber.slice(-4)}` : metadata.accountName,
      endingBalance: metadata.endingBalance ?? endingBalance,
      confidence: accountNumber ? Math.max(metadata.confidence, 90) : metadata.confidence,
    },
    rows,
  };
};

const cimbDatePattern = `(?:${monthNamePattern}\\s+\\d{1,2},\\s+\\d{4}|\\d{1,2}\\s+${monthNamePattern}\\s+\\d{4}|\\d{4}-\\d{2}-\\d{2})`;

const parseCimbDate = (value?: string | null) => {
  if (!value) {
    return null;
  }

  const normalized = normalizeWhitespace(value);
  const monthFirstMatch = normalized.match(new RegExp(`^(${monthNamePattern})\\s+(\\d{1,2}),\\s*(\\d{4})$`, "i"));
  const dayFirstMatch = normalized.match(new RegExp(`^(\\d{1,2})\\s+(${monthNamePattern})\\s+(\\d{4})$`, "i"));

  if (monthFirstMatch || dayFirstMatch) {
    const monthToken = monthFirstMatch?.[1] ?? dayFirstMatch?.[2] ?? "";
    const dayToken = monthFirstMatch?.[2] ?? dayFirstMatch?.[1] ?? "";
    const yearToken = monthFirstMatch?.[3] ?? dayFirstMatch?.[3] ?? "";
    const monthIndex = monthIndexByAbbr[monthToken.slice(0, 3).toUpperCase()];
    if (monthIndex === undefined) {
      return null;
    }

    return new Date(Date.UTC(Number(yearToken), monthIndex, Number(dayToken), 12));
  }

  const iso = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12));
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isCimbBoilerplateLine = (line: string) =>
  /^STATEMENT\s+OF\s+ACCOUNT$/i.test(line) ||
  /^FOR\s+.+\s+TO\s+.+$/i.test(line) ||
  /^GSAVE\s*-\s*SAVINGS\s+ACCOUNT\s+NO\./i.test(line) ||
  /^PAGE\s+\d+\s+OF\s+\d+$/i.test(line) ||
  /^OPENING\s+BALANCE$/i.test(line) ||
  /^CLOSING\s+BALANCE/i.test(line) ||
  /^TOTAL\s+DEPOSIT/i.test(line) ||
  /^TOTAL\s+WITHDRAWAL/i.test(line) ||
  /^STATEMENT\s+IS\s+GENERATED\s+ON/i.test(line) ||
  /^DEPOSIT$/i.test(line) ||
  /^WITHDRAWAL$/i.test(line) ||
  /^BALANCE$/i.test(line) ||
  /^REF$/i.test(line) ||
  /^ACCOUNT\s+HOLDER$/i.test(line);

const splitCimbStatementSections = (lines: string[]) => {
  const sectionStarts = lines
    .map((line, index) => (/^FOR\s+.+\s+TO\s+.+$/i.test(line) ? index : -1))
    .filter((index) => index >= 0);

  if (sectionStarts.length === 0) {
    return [lines];
  }

  return sectionStarts.map((startIndex, sectionIndex) => lines.slice(startIndex, sectionStarts[sectionIndex + 1] ?? lines.length));
};

const guessCimbCategoryName = (description: string, type: TransactionType) => {
  const lower = description.toLowerCase();
  if (/^opening balance$/i.test(description)) return "Opening Balance";
  if (/credit interest/.test(lower)) return "Income";
  if (/tax rate|withheld tax|tax withheld/.test(lower)) return "Financial";
  if (/back office cash in|cash in adjustment/.test(lower)) return "Financial";
  if (/instapay inward transfer|inward transfer/.test(lower)) return "Transfers";
  if (/instapay transfer to|transfer to|transfer from/.test(lower)) return "Transfers";
  if (/cash in|cash out/.test(lower)) return "Transfers";
  if (/interest/.test(lower)) return "Income";
  return guessCategoryName(description, type);
};

const parseCimbTransactionSegment = (
  segmentLines: string[],
  state: {
    accountName: string;
    institution: string | null;
    statementStartDate: string | null;
    statementEndDate: string | null;
  }
) : ParsedImportRow[] => {
  if (segmentLines.length === 0) {
    return [];
  }

  const rows: ParsedImportRow[] = [];
  const dateStartPattern = new RegExp(`^(${cimbDatePattern})(?:\\s+(.+))?$`, "i");
  let pendingPrelude: string[] = [];
  let activeRow: {
    date: Date;
    amountDelta: number;
    deposit: number;
    withdrawal: number;
    balance: number;
    descriptionParts: string[];
    reference: string | null;
    isOpeningBalance: boolean;
    rawLine: string;
    confidence: number;
  } | null = null;

  const finalizeActiveRow = () => {
    if (!activeRow) {
      return;
    }

    const description = normalizeWhitespace(activeRow.descriptionParts.join(" "));
    if (activeRow.isOpeningBalance) {
      rows.push({
        date: activeRow.date.toISOString().slice(0, 10),
        amount: activeRow.balance.toFixed(2),
        merchantRaw: "Beginning balance",
        merchantClean: "Beginning balance",
        description: `Opening balance for ${state.accountName}`,
        categoryName: "Opening Balance",
        accountName: state.accountName,
        institution: state.institution ?? undefined,
        type: "transfer",
        rawPayload: {
          bank: "CIMB",
          kind: "opening_balance",
          accountName: state.accountName,
          statementStartDate: state.statementStartDate,
          statementEndDate: state.statementEndDate,
          openingBalance: activeRow.balance.toFixed(2),
          balance: activeRow.balance.toFixed(2),
          line: activeRow.rawLine,
          ref: activeRow.reference,
        },
        confidence: 100,
      });
      activeRow = null;
      return;
    }

    const descriptionLower = description.toLowerCase();
    const transferLike =
      /transfer|instapay|inward transfer|outward transfer|cash in|cash out|send money|receive money/.test(descriptionLower);

    let type: TransactionType = activeRow.amountDelta >= 0 ? "income" : "expense";
    if (/credit interest/.test(descriptionLower)) {
      type = "income";
    } else if (/tax rate|withheld tax|tax withheld/.test(descriptionLower)) {
      type = "expense";
    } else if (transferLike) {
      type = "transfer";
    }

    const ambiguousTransfer = /transfer to/.test(descriptionLower) && activeRow.deposit > 0 && activeRow.withdrawal === 0;
    const confidence = ambiguousTransfer ? 72 : activeRow.confidence;

    rows.push({
      date: activeRow.date.toISOString().slice(0, 10),
      amount: Math.abs(activeRow.amountDelta).toFixed(2),
      merchantRaw: humanizeMerchantText(description || activeRow.rawLine),
      merchantClean: summarizeMerchantText(description || activeRow.rawLine, state.institution),
      description: description || activeRow.rawLine,
      categoryName: guessCimbCategoryName(description || activeRow.rawLine, type),
      accountName: state.accountName,
      institution: state.institution ?? undefined,
      type,
      rawPayload: {
        bank: "CIMB",
        accountName: state.accountName,
        statementStartDate: state.statementStartDate,
        statementEndDate: state.statementEndDate,
        amountDelta: activeRow.amountDelta.toFixed(2),
        depositText: activeRow.deposit.toFixed(2),
        withdrawalText: activeRow.withdrawal.toFixed(2),
        balanceText: activeRow.balance.toFixed(2),
        balance: activeRow.balance.toFixed(2),
        line: activeRow.rawLine,
        ref: activeRow.reference,
      },
      confidence,
    });

    activeRow = null;
  };

  for (const rawLine of segmentLines) {
    const line = normalizeWhitespace(rawLine);
    if (!line || isCimbBoilerplateLine(line)) {
      continue;
    }

    const referenceMatch = line.match(/^Reference\s+No\.?\s*(.+)$/i);
    if (referenceMatch) {
      if (activeRow) {
        activeRow.reference = normalizeWhitespace(referenceMatch[1]);
      }
      continue;
    }

    const dateMatch = line.match(dateStartPattern);
    if (!dateMatch) {
      if (activeRow) {
        activeRow.descriptionParts.push(line);
      } else {
        pendingPrelude.push(line);
      }
      continue;
    }

    finalizeActiveRow();

    const date = parseCimbDate(dateMatch[1]);
    if (!date) {
      pendingPrelude = [];
      continue;
    }

    const tail = normalizeWhitespace(dateMatch[2] ?? "");
    const moneyMatches = tail.match(/[0-9][0-9,]*\.\d{2}/g) ?? [];
    const leadingText =
      moneyMatches.length > 0 && moneyMatches[0]
        ? tail.slice(0, tail.indexOf(moneyMatches[0])).replace(/\bPHP\b/gi, "").replace(/\s+/g, " ").trim()
        : tail.replace(/\bPHP\b/gi, "").replace(/\s+/g, " ").trim();
    const descriptionParts = [...pendingPrelude];
    if (leadingText) {
      descriptionParts.push(leadingText);
    }

    const isOpeningBalance = /opening\s+balance/i.test(tail);
    if (isOpeningBalance) {
      const openingBalance = parseMoney(moneyMatches.at(-1) ?? null);
      if (openingBalance !== null) {
        activeRow = {
          date,
          amountDelta: 0,
          deposit: 0,
          withdrawal: 0,
          balance: openingBalance,
          descriptionParts,
          reference: null,
          isOpeningBalance: true,
          rawLine: line,
          confidence: 100,
        };
        finalizeActiveRow();
      }
      pendingPrelude = [];
      continue;
    }

    if (moneyMatches.length < 3) {
      pendingPrelude = [];
      continue;
    }

    const deposit = parseMoney(moneyMatches[0]);
    const withdrawal = parseMoney(moneyMatches[1]);
    const balance = parseMoney(moneyMatches[2]);
    if (deposit === null || withdrawal === null || balance === null) {
      pendingPrelude = [];
      continue;
    }

    activeRow = {
      date,
      amountDelta: deposit - withdrawal,
      deposit,
      withdrawal,
      balance,
      descriptionParts,
      reference: null,
      isOpeningBalance: false,
      rawLine: line,
      confidence: /transfer to/.test((descriptionParts.join(" ") || line).toLowerCase()) && deposit > 0 && withdrawal === 0 ? 72 : 95,
    };
    pendingPrelude = [];
  }

  finalizeActiveRow();
  return rows;
};

const parseCimbImportText = (text: string) => {
  const normalizedText = text.replace(/\u00a0/g, " ");
  const compact = normalizeWhitespace(normalizedText);
  if (!/\bCIMB\b/i.test(compact) && !/GSAVE\s*-\s*SAVINGS\s+ACCOUNT\s+NO\./i.test(compact)) {
    return null;
  }

  const lines = normalizedText
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  const sections = splitCimbStatementSections(lines);
  const parsedSections = sections
    .map((sectionLines) => {
      const sectionText = sectionLines.join(" ");
      const accountNumber =
        sectionText.match(/GSave\s*-\s*Savings\s+Account\s+No\.\s*([0-9\s-]+)/i)?.[1]?.replace(/\D/g, "").slice(0, 16) ?? null;
      const accountName = accountNumber ? `CIMB ${accountNumber.slice(-4)}` : "CIMB";
      const holderName =
        sectionLines.find(
          (line) =>
            !isCimbBoilerplateLine(line) &&
            !/^\d/.test(line) &&
            !/^(?:DEPOSIT|WITHDRAWAL|BALANCE|REF)$/i.test(line) &&
            /[A-Za-z]/.test(line)
        ) ?? null;
      const periodLine = sectionLines.find((line) => /^For\s+.+\s+to\s+.+$/i.test(line)) ?? null;
      const statementPeriodMatch = periodLine?.match(/^For\s+(.+?)\s+to\s+(.+)$/i);
      const startDate = parseCimbDate(statementPeriodMatch?.[1] ?? null);
      const endDate = parseCimbDate(statementPeriodMatch?.[2] ?? null);
      const openingBalance =
        parseMoney(sectionText.match(/Opening\s+Balance\s+PHP\s+([0-9][0-9,]*\.\d{2})/i)?.[1] ?? null) ??
        parseMoney(sectionText.match(/Beginning\s+Balance\s+PHP\s+([0-9][0-9,]*\.\d{2})/i)?.[1] ?? null);
      const endingBalance =
        parseMoney(sectionText.match(/Closing\s+Balance(?:\s+as\s+of\s+.+?)?\s+PHP\s+([0-9][0-9,]*\.\d{2})/i)?.[1] ?? null) ??
        parseMoney(sectionText.match(/Ending\s+Balance\s+PHP\s+([0-9][0-9,]*\.\d{2})/i)?.[1] ?? null);

      const rows: ParsedImportRow[] = [];
      const rowSegments: string[][] = [];
      let current: string[] = [];
      let pendingPrelude: string[] = [];
      for (const line of sectionLines) {
        if (isCimbBoilerplateLine(line)) {
          continue;
        }

        if (new RegExp(`^${cimbDatePattern}`, "i").test(line)) {
          if (current.length > 0) {
            rowSegments.push(current);
          }
          current = [...pendingPrelude, line];
          pendingPrelude = [];
          continue;
        }

        if (current.length > 0) {
          current.push(line);
          continue;
        }

        pendingPrelude.push(line);
      }

      if (current.length > 0) {
        rowSegments.push(current);
      }

      for (const segmentLines of rowSegments) {
        const parsedRows = parseCimbTransactionSegment(segmentLines, {
          accountName,
          institution: "CIMB",
          statementStartDate: startDate ? startDate.toISOString() : null,
          statementEndDate: endDate ? endDate.toISOString() : null,
        });

        if (parsedRows.length > 0) {
          rows.push(...parsedRows);
        }
      }

      return {
        metadata: {
          institution: "CIMB",
          accountNumber,
          accountName,
          accountType: "bank",
          openingBalance,
          endingBalance,
          startDate: startDate ? startDate.toISOString() : null,
          endDate: endDate ? endDate.toISOString() : null,
          confidence: Math.min(100, 80 + (accountNumber ? 10 : 0) + (rows.length > 0 ? 5 : 0) + (holderName ? 5 : 0)),
        } satisfies DetectedStatementMetadata,
        rows,
      };
    })
    .filter((section) => section.rows.length > 0);

  if (parsedSections.length === 0) {
    return null;
  }

  const uniqueAccountNumbers = new Set(parsedSections.map((section) => section.metadata.accountNumber).filter(Boolean));

  if (uniqueAccountNumbers.size > 1) {
    const selected = [...parsedSections].sort((left, right) => right.rows.length - left.rows.length)[0];
    return selected.rows.length > 0 ? selected : null;
  }

  const mergedRows = parsedSections.flatMap((section) => section.rows);
  const firstSection = parsedSections[0];
  const lastSection = parsedSections[parsedSections.length - 1] ?? firstSection;

  return mergedRows.length > 0
    ? {
        metadata: {
          ...firstSection.metadata,
          endingBalance: lastSection.metadata.endingBalance ?? getTrailingBalanceFromParsedRows(mergedRows),
        },
        rows: mergedRows,
      }
    : null;
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
    institution: string | null;
    statementStartDate: string | null;
  }
) => {
  const normalized = normalizeWhitespace(line);
  const compact = compactWhitespace(normalized);
  const match =
    compact.match(new RegExp(`^(${monthNamePattern}\\d{1,2}(?:,\\d{4})?|\\d{1,2}${monthNamePattern}(?:,\\d{4})?)(.+)$`, "i")) ??
    compact.match(/^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)(.+)$/i) ??
    compact.match(new RegExp(`^(\\d{1,2}(?:${monthNamePattern})(?:,\\d{4})?)(.+)$`, "i"));

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
    const monthMatch = dateToken.match(new RegExp(`^(${monthNamePattern})\\s*(\\d{1,2})(?:,?(\\d{4}))?$`, "i"));
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
      const dayMonthMatch = dateToken.match(new RegExp(`^(\\d{1,2})(${monthNamePattern})(?:,?(\\d{4}))?$`, "i"));
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
    merchantClean: summarizeMerchantText(displayText, state.institution),
    description: displayText,
    categoryName: guessBpiCategoryName(displayText, type),
    accountName: state.accountName,
    institution: state.institution ?? undefined,
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
  const compactLines = lines.map((line) => compactWhitespace(line).toUpperCase());
  const transactionHeaderIndex = compactLines.findIndex(
    (line) =>
      /DATE.*DESCRIPTION.*REF.*DETAILS/.test(line) ||
      /DATE.*DESCRIPTION.*REFERENCE.*DETAILS/.test(line) ||
      /DATE.*DESCRIPTION.*DEBIT.*CREDIT.*BALANCE/.test(line) ||
      /DATE.*DESCRIPTION.*DEB.*AMT.*CREDIT.*AMT.*BALANCE/.test(line) ||
      /TRANSACTION.*DETAILS/.test(line)
  );
  const transactionLines = transactionHeaderIndex >= 0 ? lines.slice(transactionHeaderIndex + 1) : lines;

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
    institution: metadata.institution ?? "BPI",
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
      institution: metadata.institution ?? "BPI",
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

  for (const line of transactionLines) {
    const parsed = parseBpiTransactionLine(line, state);
    year = state.year;
    previousMonthIndex = state.previousMonthIndex;
    previousBalance = state.previousBalance;
    if (parsed) {
      rows.push(parsed);
    }
  }

  const hasStatementTotals = transactionLines.some((line) => /BALANCE\s+THIS\s+STATEMENT|TOTAL\s+DEBIT|TOTAL\s+CREDIT/i.test(line));
  const hasTransactionTable = transactionHeaderIndex >= 0 || hasStatementTotals;
  const adjustedConfidence =
    rows.length > 0 && rows.length <= 2 && hasTransactionTable ? Math.min(metadata.confidence, 60) : metadata.confidence;

  return {
    metadata: {
      ...metadata,
      confidence: adjustedConfidence,
    },
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
  const accountName = formatSimpleBankAccountName("UnionBank", accountNumber);

  const statementDateLine = lines.find((line) => /TRANSACTION HISTORY AS OF/i.test(line)) ?? "";
  const statementDateMatch = statementDateLine.match(/TRANSACTION HISTORY AS OF\s+(.+)$/i);
  const endDate = statementDateMatch?.[1] ? new Date(statementDateMatch[1]) : null;

  return {
    institution: "UnionBank",
    accountNumber,
    accountName,
    accountType: "bank",
    openingBalance: null,
    endingBalance: null,
    startDate: null,
    endDate: endDate && !Number.isNaN(endDate.getTime()) ? endDate.toISOString() : null,
    confidence: accountNumber ? 90 : 78,
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

const parseUnionBankTransactionSegment = (
  segment: string[],
  state: { accountName: string; institution: string | null }
) => {
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
    merchantClean: summarizeMerchantText(description, state.institution),
    description,
    categoryName: guessUnionBankCategoryName(description, type),
    accountName: state.accountName,
    institution: state.institution ?? undefined,
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
    .map((segment) =>
      parseUnionBankTransactionSegment(segment, {
        accountName: metadata.accountName ?? "UnionBank",
        institution: metadata.institution ?? "UnionBank",
      })
    )
    .filter(Boolean) as ParsedImportRow[];

  const lastRow = rows.at(-1);
  const endingBalanceText =
    lastRow?.rawPayload && typeof lastRow.rawPayload === "object" && typeof lastRow.rawPayload.balanceText === "string"
      ? lastRow.rawPayload.balanceText
      : null;
  const endingBalance = parseMoney(endingBalanceText?.replace(/^PHP\s*/i, "") ?? null);

  return rows.length > 0
    ? {
        metadata: {
          ...metadata,
          endingBalance,
        },
        rows,
      }
    : null;
};

export const detectStatementMetadata = (text: string): DetectedStatementMetadata | null => {
  const gcashMetadata = gcashStatementMetadata(text);
  if (gcashMetadata) {
    return gcashMetadata;
  }

  const aubCardMetadata = parseAubCardImportText(text);
  if (aubCardMetadata) {
    return aubCardMetadata.metadata;
  }

  const aubSavingsMetadata = parseAubSavingsImportText(text);
  if (aubSavingsMetadata) {
    return aubSavingsMetadata.metadata;
  }

  const rcbcMetadata = rcbcStatementMetadata(text);
  if (rcbcMetadata) {
    return rcbcMetadata;
  }

  const unionbankMetadata = unionbankStatementMetadata(text);
  if (unionbankMetadata) {
    return unionbankMetadata;
  }

  const bpiCreditMetadata = bpiCreditCardStatementMetadata(text);
  if (bpiCreditMetadata) {
    return bpiCreditMetadata;
  }

  const bpiMetadata = bpiStatementMetadata(text);
  if (bpiMetadata) {
    return bpiMetadata;
  }

  const cimbMetadata = parseCimbImportText(text);
  if (cimbMetadata) {
    return cimbMetadata.metadata;
  }

  const bdoParsed = parseBdoSavingsImportText(text);
  if (bdoParsed) {
    return bdoParsed.metadata;
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
    accountType: inferAccountTypeFromStatement(institution, accountName, "bank"),
    openingBalance,
    endingBalance,
    startDate: startDate ? startDate.toISOString() : null,
    endDate: endDate ? endDate.toISOString() : null,
    confidence: scoreMetadataConfidence({
      institution,
      accountNumber,
      accountName,
      accountType: inferAccountTypeFromStatement(institution, accountName, "bank"),
      openingBalance,
      endingBalance,
      startDate: startDate ? startDate.toISOString() : null,
      endDate: endDate ? endDate.toISOString() : null,
    }),
  };
};

const parseDelimitedText = (text: string, delimiter: string, institution?: string | null) => {
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

const isHeuristicBoilerplateLine = (line: string, institution?: string | null) => {
  const lower = line.toLowerCase();
  if (
    /^account\s+no\.?/i.test(line) ||
    /^account\s+number/i.test(line) ||
    /^customer\s+data/i.test(line) ||
    /^currency\s+code/i.test(line) ||
    /^short\s+name/i.test(line) ||
    /^address/i.test(line) ||
    /^statement\s+date/i.test(line) ||
    /^statement\s+of\s+account/i.test(line) ||
    /^page\s+\d+\s+of\s+\d+/i.test(line) ||
    /^available\s+balance/i.test(line) ||
    /^opening\s+balance/i.test(line) ||
    /^closing\s+balance/i.test(line) ||
    /^ending\s+balance/i.test(line) ||
    /^beginning\s+balance/i.test(line)
  ) {
    return true;
  }

  if (institution === "BDO") {
    if (/^customer\s+data/i.test(line) || /^account\s+no\.?/i.test(line) || /^currency\s+code/i.test(line) || /^short\s+name/i.test(line)) {
      return true;
    }
    if (/^account\s+number/i.test(line) || /^address/i.test(line) || /bdo\s+statement\s+of\s+account/i.test(line)) {
      return true;
    }
  }

  if (institution === "Maya") {
    if (/^statement\s+date/i.test(line) || /^period\s+covered/i.test(line) || /^card\s+number/i.test(line) || /^previous\s+statement\s+balance/i.test(line)) {
      return true;
    }
  }

  if (institution === "MariBank" || institution === "Maribank" || institution === "SeaBank" || institution === "Seabank") {
    if (/^seabank\b/i.test(line) || /^maribank\b/i.test(line) || /^account\s+statement/i.test(line) || /^contact\s+us/i.test(line)) {
      return true;
    }
    if (/^statement\s+period/i.test(line) || /^statement\s+balance/i.test(line) || /^available\s+balance/i.test(line)) {
      return true;
    }
  }

  // Avoid accidentally treating long ID/header rows as transactions when OCR is noisy.
  if (/^[A-Z0-9\s,.-]{20,}$/.test(line) && !/\d{4}-\d{2}-\d{2}/.test(line) && !/\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(line)) {
    if (/\b(ACCOUNT|CUSTOMER|STATEMENT|BALANCE|SUMMARY|CODE|NAME|ADDRESS|CONTACT|PERIOD)\b/i.test(line)) {
      return true;
    }
  }

  return false;
};

const parseHeuristicLines = (text: string, institution?: string | null) => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines
    .map((line) => {
      if (isHeuristicBoilerplateLine(line, institution)) {
        return null;
      }

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
        merchantClean: summarizeMerchantText(merchant || line, institution),
        description: line,
        categoryName: guessCategoryName(line, type),
        institution: institution ?? undefined,
        type,
        rawPayload: { line },
      } satisfies ParsedImportRow;
    })
    .filter(Boolean) as ParsedImportRow[];
};

export const parseImportText = (
  text: string,
  fileName: string,
  fileType: string,
  context: ImportParseContext = {}
): ParsedImportRow[] => {
  const institution = context.institution ?? null;
  const gcashParsed = parseGcashImportText(text);
  if (gcashParsed && gcashParsed.rows.length > 0) {
    return gcashParsed.rows;
  }

  const aubCardParsed = parseAubCardImportText(text);
  if (aubCardParsed) {
    return aubCardParsed.rows;
  }

  const aubSavingsParsed = parseAubSavingsImportText(text);
  if (aubSavingsParsed) {
    return aubSavingsParsed.rows;
  }

  const rcbcSavingsParsed = parseRcbcSavingsImportText(text);
  if (rcbcSavingsParsed) {
    return rcbcSavingsParsed.rows;
  }

  const rcbcParsed = parseRcbcImportText(text);
  if (rcbcParsed) {
    return rcbcParsed.rows;
  }

  const bdoParsed = parseBdoSavingsImportText(text);
  if (bdoParsed) {
    return bdoParsed.rows;
  }

  const unionbankParsed = parseUnionBankImportText(text);
  if (unionbankParsed) {
    return unionbankParsed.rows;
  }

  const cimbParsed = parseCimbImportText(text);
  if (cimbParsed) {
    return cimbParsed.rows;
  }

  const bpiCreditParsed = parseBpiCreditCardImportText(text);
  if (bpiCreditParsed) {
    return bpiCreditParsed.rows;
  }

  const bpiParsed = parseBpiImportText(text);
  if (bpiParsed) {
    return bpiParsed.rows;
  }

  const delimiter = delimiterForFile(fileType, fileName);
  const firstLine = text.split(/\r?\n/)[0] ?? "";
  const looksDelimited = /,|\t|;/.test(firstLine);

  if (!looksDelimited) {
    return parseHeuristicLines(text, institution);
  }

  const records = parseDelimitedText(text, delimiter, institution);

  return records.map((record) => ({
    date: record.date || record.transaction_date || record.posted_at || record.posted,
    amount: record.amount || record.value || record.debit || record.credit,
    merchantRaw: humanizeMerchantText(record.merchant || record.description || record.name || record.payee || record.label || ""),
    merchantClean: summarizeMerchantText(record.merchant_clean || record.clean_merchant || record.name || record.merchant || record.description || "", institution),
    description: record.description || record.memo || record.notes || record.detail,
    categoryName: record.category || record.category_name || guessCategoryName(record.description || record.merchant || "", inferType(record)),
    accountName: record.account || record.account_name || record.source,
    institution: institution ?? undefined,
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
