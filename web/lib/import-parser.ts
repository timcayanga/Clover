import type { TransactionType } from "@prisma/client";

export type ParsedImportRow = {
  date?: string;
  amount?: string;
  merchantRaw?: string;
  merchantClean?: string;
  description?: string;
  categoryName?: string;
  accountName?: string;
  type?: TransactionType;
  rawPayload?: Record<string, unknown>;
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
  if (type === "income" || /salary|payroll|income|deposit|credit memo/.test(lower)) return "Income";
  if (/transfer|instapay|pesonet|wise to|to savings|to checking/.test(lower)) return "Transfers";
  if (/grocery|supermarket|market|food|dining|restaurant|coffee|cafe|meal|takeout/.test(lower)) return "Food & Dining";
  if (/grab|uber|taxi|bus|train|parking|gas|fuel|transport|ride/.test(lower)) return "Transport";
  if (/rent|mortgage|apartment|housing/.test(lower)) return "Housing";
  if (/bill|utilities|electric|water|internet|phone|subscription|openai|netflix|spotify/.test(lower)) return "Bills & Utilities";
  if (/travel|airbnb|hotel|airline|flight|tour|holiday/.test(lower)) return "Travel & Lifestyle";
  if (/shop|shopping|mall|amazon|lazada|shopee|retail/.test(lower)) return "Shopping";
  if (/health|doctor|clinic|pharmacy|medical|hospital/.test(lower)) return "Health & Wellness";
  if (/education|tuition|school|college|course|learning/.test(lower)) return "Education";
  if (/gift|donation|charity|present/.test(lower)) return "Gifts & Donations";
  if (/business|invoice|client|contract/.test(lower)) return "Business";
  if (/fee|interest|loan|financial|bank charge/.test(lower)) return "Financial";
  return "Other";
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

const parseMoney = (value?: string | null) => {
  if (!value) return null;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const parseBpiDate = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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
  const normalized = text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  if (!/BANK OF THE PHILIPPINE ISLANDS|^\s*FORBES PARK\s+SAVINGS\s+BET-PHP/i.test(normalized)) {
    return null;
  }

  const accountSection = normalized.match(/\bNO\s*:\s*([0-9\s-]+)/i)?.[1] ?? "";
  const accountNumber = accountSection.replace(/\D/g, "").slice(0, 10) || null;
  const accountName = accountNumber ? `BPI ${accountNumber.slice(-4)}` : "BPI";

  const periodMatch = normalized.match(/PERIOD COVERED\s+([A-Z]{3}\s+\d{1,2},\s+\d{4})\s*-\s*([A-Z]{3}\s+\d{1,2},\s+\d{4})/i);
  const startDate = parseBpiDate(periodMatch?.[1] ?? null);
  const endDate = parseBpiDate(periodMatch?.[2] ?? null);

  const openingBalance = parseMoney(normalized.match(/BEGINNING BALANCE\s+([0-9,]+\.\d{2})/i)?.[1]);
  const endingBalance =
    parseMoney(normalized.match(/BALANCE THIS STATEMENT\s+([0-9,]+\.\d{2})/i)?.[1]) ??
    parseMoney(normalized.match(/ENDING BALANCE\s+([0-9,]+\.\d{2})/i)?.[1]);

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

const guessBpiCategoryName = (description: string, type: TransactionType) => {
  const lower = description.toLowerCase();
  if (/^beginning balance$/i.test(description)) return "Opening Balance";
  if (type === "transfer") return "Transfers";
  if (/transfer fee|service charge|withheld tax|tax withheld|bank charge|fee/.test(lower)) return "Financial";
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
  const match = normalized.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+(.+)$/i);

  if (!match) {
    return null;
  }

  const monthIndex = monthIndexByAbbr[match[1].slice(0, 3).toUpperCase()];
  if (state.previousMonthIndex !== null && monthIndex < state.previousMonthIndex) {
    state.year += 1;
  }
  state.previousMonthIndex = monthIndex;

  const day = Number(match[2]);
  const date = new Date(Date.UTC(state.year, monthIndex, day, 12));
  const moneyMatches = normalized.match(/[0-9][0-9,]*\.\d{2}/g) ?? [];
  const currentBalance = parseMoney(moneyMatches.at(-1) ?? null);
  const previousBalance = state.previousBalance;
  const amountDelta =
    currentBalance !== null && previousBalance !== null ? currentBalance - previousBalance : parseMoney(moneyMatches.at(-2) ?? null) ?? 0;
  if (currentBalance !== null) {
    state.previousBalance = currentBalance;
  }

  const description = normalized
    .replace(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+/i, "")
    .replace(/[0-9][0-9,]*\.\d{2}/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  const isOpeningBalance = /^BEGINNING BALANCE$/i.test(description);
  if (isOpeningBalance) {
    return null;
  }

  const descriptionLower = description.toLowerCase();
  let type: TransactionType = amountDelta >= 0 ? "income" : "expense";
  if (/transfer/.test(descriptionLower) && !/fee/.test(descriptionLower)) {
    type = "transfer";
  } else if (/fee|tax withheld|withheld tax|bills payment|payment|withdrawal|service charge/.test(descriptionLower)) {
    type = "expense";
  } else if (/interest earned/.test(descriptionLower)) {
    type = "income";
  }

  const amount = Math.abs(amountDelta).toFixed(2);

  return {
    date: date.toISOString().slice(0, 10),
    amount,
    merchantRaw: description || normalized,
    merchantClean: description || normalized,
    description: normalized,
    categoryName: guessBpiCategoryName(description || normalized, type),
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
  const metadata = bpiStatementMetadata(text);
  if (!metadata) {
    return null;
  }

  const lines = text
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

export const detectStatementMetadata = (text: string): DetectedStatementMetadata | null => {
  return bpiStatementMetadata(text);
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
        merchantRaw: merchant || line,
        merchantClean: merchant || line,
        description: line,
        categoryName: guessCategoryName(line, type),
        type,
        rawPayload: { line },
      } satisfies ParsedImportRow;
    })
    .filter(Boolean) as ParsedImportRow[];
};

export const parseImportText = (text: string, fileName: string, fileType: string): ParsedImportRow[] => {
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
    merchantRaw: record.merchant || record.description || record.name || record.payee || record.label,
    merchantClean: record.merchant_clean || record.clean_merchant || record.name,
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
    return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T12:00:00Z`);
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

export const parseAmountValue = (value?: string | null) => {
  if (!value) return null;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};
