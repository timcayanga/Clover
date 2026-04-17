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
