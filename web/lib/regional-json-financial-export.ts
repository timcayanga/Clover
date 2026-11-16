import type { ImportParseContext, ParsedImportRow } from "@/lib/import-parser";
import { parseIndonesianAmount, parseIndonesianDate } from "@/lib/indonesian-financial-text";
import { parseKoreanAmount, parseKoreanDate } from "@/lib/korean-financial-text";

type RecordValue = Record<string, unknown>;
const object = (value: unknown): RecordValue | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
const populated = (value: unknown) => value !== undefined && value !== null && value !== "";
function unsafe(field: string): never {
  throw new Error(`Clover could not safely read this regional JSON export (${field}). Check the source file. Nothing was added.`);
}

// This is an adapter for Clover's existing flat financial-export schema, not an
// Open Banking/SNAP connector. The original records remain separate from the
// temporary table used to share the established ledger checks.
export function parseRegionalJsonFinancialExport(
  payload: unknown,
  context: ImportParseContext,
  parseTable: (text: string, fileName: string, fileType: string, context?: ImportParseContext) => ParsedImportRow[] | null,
): ParsedImportRow[] | null {
  const root = object(payload);
  const nested = object(root?.data);
  const lists = Array.isArray(payload) ? [payload] :
    [root?.transactions, root?.records, root?.items, root?.activities, nested?.transactions, nested?.records].filter(Array.isArray);
  const records: unknown[] = lists[0] ?? [];
  const locale = String(root?.locale ?? "").toLowerCase();
  const sourceCurrencies = [root?.currency, root?.currencyCode, root?.currency_code, ...lists.flat().map(record => {
    const row = object(record);
    return row?.currency ?? row?.currencyCode ?? row?.currency_code;
  })].map(value => typeof value === "string" ? value.trim().toUpperCase() : "");
  const currencies = sourceCurrencies.some(Boolean) ? sourceCurrencies : [context.currency?.toUpperCase() ?? ""];
  const regionalCurrencies = new Set(currencies.filter(value => value === "KRW" || value === "IDR"));
  const language = /^(?:ko|ko-kr)$/.test(locale) ? "ko" : /^(?:id|id-id)$/.test(locale) ? "id" :
    regionalCurrencies.size === 1 ? regionalCurrencies.has("KRW") ? "ko" : "id" : null;
  if (!language) {
    if (regionalCurrencies.size > 1) unsafe("mixed number formats; specify locale");
    return null;
  }
  if (lists.length !== 1) unsafe("multiple transaction lists");
  if ([root, nested].some(value => value && (
    value.hasMore === true || value.has_more === true || value.next_page_yn === "Y" ||
    populated(value.nextPageToken) || populated(value.next_page_token)
  ))) unsafe("incomplete paginated export");
  if (!records.length) return [];

  const string = (value: unknown, field: string) => typeof value === "string" ? value.trim() : unsafe(field);
  const money = (value: unknown, field: string): string => {
    const number = typeof value === "number" ? value : typeof value === "string"
      ? (language === "ko" ? parseKoreanAmount(value) : parseIndonesianAmount(value)) : null;
    if (number === null || !Number.isFinite(number) || !Number.isSafeInteger(Math.round(number * 100)) ||
        Math.abs(number * 100 - Math.round(number * 100)) > 0.00001) unsafe(field);
    return number.toFixed(2);
  };
  const date = (value: unknown, field: string) => {
    let text = string(value, field);
    // Preserve the bank's printed calendar date, not its UTC-converted day.
    if (text.includes("T")) {
      const timestamp = text.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|([+-])(\d{2}):(\d{2}))$/);
      if (!timestamp || Number(timestamp[2]) > 23 || Number(timestamp[3]) > 59 || Number(timestamp[4]) > 59 ||
          Number(timestamp[7] ?? 0) > 14 || Number(timestamp[8] ?? 0) > 59 ||
          (Number(timestamp[7]) === 14 && Number(timestamp[8]) !== 0)) unsafe(field);
      text = timestamp[1];
    }
    const parsed = language === "ko" ? parseKoreanDate(text) : parseIndonesianDate(text);
    return parsed?.toISOString().slice(0, 10) ?? unsafe(field);
  };
  const read = (record: RecordValue | null, keys: string[], normalize = string) => {
    const values = keys.filter(key => populated(record?.[key])).map(key => normalize(record![key], key));
    if (new Set(values).size > 1) unsafe(`conflicting ${keys[0]} fields`);
    return values[0] ?? "";
  };
  const readMoney = (record: RecordValue, keys: string[]) => {
    read(record, keys, money); // Validate every alias before choosing a value.
    const value = keys.map(key => record[key]).find(populated);
    // Keep printed signs, currency markers and DB/CR suffixes for the shared
    // ledger's direction/currency checks. JSON numbers have no local separators.
    return value === undefined ? "" : typeof value === "number" ? value.toFixed(2) : String(value).trim();
  };
  const currency = (value: unknown, field: string) => {
    const text = string(value, field).toUpperCase();
    if (!/^[A-Z]{3}$/.test(text)) unsafe(field);
    return text;
  };
  const rootCurrency = read(root, ["currency", "currencyCode", "currency_code"], currency) || (context.currency ? currency(context.currency, "context currency") : "");
  const accountNumber = read(root, ["accountNumber", "account_number"]) || context.accountNumber || "";
  const accountName = read(root, ["accountName", "account_name"]) || context.accountName || "";
  const institution = read(root, ["bankName", "institution", "provider"]) || context.institution || "";
  const headers = language === "ko"
    ? ["거래일자", "적요", "거래금액", "출금금액", "입금금액", "거래후잔액", "통화", "입출금구분", "거래상태", "수수료", "분류", "계좌명", "계좌번호", "은행명", "거래번호", "원거래금액", "원거래통화"]
    : ["Tanggal", "Keterangan", "Nominal", "Debet", "Kredit", "Saldo", "Mata uang", "Jenis transaksi", "Status transaksi", "Biaya admin", "Kategori", "Nama rekening", "Nomor rekening", "Nama bank", "Referensi", "Nominal asli", "Mata uang asli"];
  headers.push("merchant");
  const rows = records.map(candidate => {
    const record = object(candidate);
    if (!record) unsafe("transaction record");
    const recordDate = read(record, ["date", "transactionDate", "transaction_date"], date) ||
      read(record, ["postedDate", "posted_at", "bookingDate"], date);
    const name = ["description", "memo", "merchantRaw", "merchantClean", "normalizedName", "transactionName", "merchant", "payee", "name"]
      .filter(key => populated(record[key])).map(key => string(record[key], key)).find(Boolean);
    if (!recordDate || !name) unsafe("missing date or description");
    const amount = readMoney(record, ["amount", "value", "transactionAmount", "transaction_amount"]);
    const debit = readMoney(record, ["debit", "debitAmount", "debit_amount"]);
    const credit = readMoney(record, ["credit", "creditAmount", "credit_amount"]);
    if (!amount && !debit && !credit) unsafe("missing amount");
    return [recordDate, name, amount, debit, credit,
      readMoney(record, ["balance", "runningBalance", "running_balance"]),
      read(record, ["currency", "currencyCode", "currency_code"], currency) || rootCurrency,
      read(record, ["type", "direction", "transactionType", "transaction_type"]),
      read(record, ["status", "transactionStatus", "transaction_status"]), readMoney(record, ["fee"]),
      read(record, ["categoryName", "category_name", "category"]),
      read(record, ["accountName", "account_name"]) || accountName,
      read(record, ["accountNumber", "account_number"]) || accountNumber,
      read(record, ["bankName", "institution", "provider"]) || institution,
      read(record, ["reference", "transactionId", "transaction_id"]),
      readMoney(record, ["originalAmount", "original_amount"]),
      read(record, ["originalCurrency", "original_currency"], currency),
      ["merchantRaw", "merchant", "payee", "name", "transactionName", "merchantClean", "normalizedName"]
        .filter(key => populated(record[key])).map(key => string(record[key], key)).find(Boolean) ?? name,
    ];
  });
  const table = [headers, ...rows].map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join("\t")).join("\n");
  const parsed = parseTable(table, "regional-export.tsv", "text/tab-separated-values", context);
  if (!parsed) unsafe("unsupported transaction table");
  return parsed.map(row => {
    const { sourceRowIndex, originalHeaders, sourceCells, ...evidence } = row.rawPayload ?? {};
    const sourceIndex = Number(sourceRowIndex) - 2;
    if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= records.length) unsafe("source record mapping");
    const sourceRecord = records[sourceIndex] as RecordValue;
    const confidence = (keys: string[], fallback: number) => {
      const value = keys.map(key => sourceRecord[key]).find(populated);
      if (value === undefined) return fallback;
      const numeric = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
      return Number.isFinite(numeric) ? Math.min(fallback, Math.max(0, Math.round(numeric <= 1 ? numeric * 100 : numeric))) : fallback;
    };
    const rowConfidence = confidence(["confidence", "parserConfidence", "parser_confidence"], row.confidence ?? 55);
    const parserConfidence = confidence(["parserConfidence", "parser_confidence", "confidence"], row.parserConfidence ?? 55);
    const status = String(evidence.status ?? "").trim();
    const reviewReason = String(evidence.reviewReason ?? "") ||
      (Math.min(rowConfidence, parserConfidence) < 80 ? "The source marks this record as low confidence. Confirm the transaction details." : "") ||
      (language === "ko" && status && !/^(?:완료|정상|거래완료|처리완료|결제완료|환불완료|환급완료|posted|settled|paid)$/i.test(status)
        ? "Confirm this transaction's final status." : "");
    return {
      ...row,
      merchantClean: read(sourceRecord, ["merchantClean", "normalizedName"]) || row.merchantClean,
      confidence: reviewReason ? Math.min(55, rowConfidence) : rowConfidence,
      parserConfidence: reviewReason ? Math.min(55, parserConfidence) : parserConfidence,
      categoryConfidence: confidence(["categoryConfidence", "category_confidence"], row.categoryConfidence ?? 35),
      rawPayload: {
        ...evidence, source: "regional_json_financial_export", kind: "financial_exchange_transaction", format: "json",
        ...(reviewReason ? { reviewRequired: true, reviewReason, reviewReasons: [reviewReason] } : {}),
        sourceIndex, sourceRecord, numberLocale: language, adapterHeaders: originalHeaders, adapterCells: sourceCells,
      },
    };
  });
}
