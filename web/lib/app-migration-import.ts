import type { ImportParseContext, ParsedImportRow } from "@/lib/import-parser";
import { sanitizeTransactionTagNames } from "@/lib/transaction-tags";

export const MIGRATION_SOURCES = ["realbyte", "money-lover", "wallet", "bluecoins", "ynab", "monarch", "spreadsheet"] as const;
export type MigrationSource = typeof MIGRATION_SOURCES[number];
export type MigrationEvidence = {
  version: 1;
  source: MigrationSource;
  sourceRow: number;
  sourceId: string;
  categoryPath: string[];
  tags: string[];
  excluded: boolean;
  direction: "income" | "expense";
  splitGroup: string | null;
  derivedTransferLeg?: boolean;
};
const object = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
export const readAppMigration = (raw: unknown): MigrationEvidence | null => {
  const value = object(object(raw)?.appMigration);
  return value?.version === 1 && MIGRATION_SOURCES.includes(value.source as MigrationSource) &&
    Array.isArray(value.categoryPath) && value.categoryPath.every(x => typeof x === "string") &&
    Array.isArray(value.tags) && value.tags.every(x => typeof x === "string") &&
    typeof value.sourceRow === "number" && typeof value.sourceId === "string" &&
    typeof value.excluded === "boolean" && (value.direction === "income" || value.direction === "expense")
    ? value as MigrationEvidence : null;
};
const key = (s: string) => s.replace(/^\uFEFF/, "").replace(/^\s*\(\d+\)\s*/, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const csv = (values: string[]) => values.map(v => `"${v.replaceAll('"', '""')}"`).join(",");
type Table = { headers: string[]; rows: string[][]; headerIndex: number; delimiter: string };
export const detectAppMigrationSource = (headers: string[]): MigrationSource | null => {
  const h = new Set(headers.map(key));
  if (h.has("migration_source")) return "spreadsheet";
  if (["account", "payee", "memo", "outflow", "inflow"].every(k => h.has(k)) && (h.has("category_group_category") || h.has("category_group"))) return "ynab";
  if (["date", "merchant", "category", "account", "original_statement", "notes", "amount", "tags"].every(k => h.has(k))) return "monarch";
  if (h.has("item_or_payee") && h.has("split") && h.has("account")) return "bluecoins";
  if (h.has("income_expense") && h.has("subcategory") && (h.has("account") || h.has("accounts"))) return "realbyte";
  if ((h.has("ref_currency_amount") || h.has("reference_currency_amount") || h.has("payment_type")) && h.has("account") && h.has("category") && h.has("amount")) return "wallet";
  if (h.has("wallet") && h.has("category") && h.has("amount") && (h.has("note") || h.has("notes"))) return "money-lover";
  return null;
};

type DateOrder = "DMY" | "MDY" | null;
// Source apps let users choose date formats. Do not use the user's country or
// JavaScript's permissive date rollover to guess an ambiguous exported date.
const numericDate = (value: string) => value.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
const dateOrderFrom = (values: string[]): DateOrder => {
  const orders = new Set<string>();
  for (const value of values) {
    const match = numericDate(value);
    if (!match) continue;
    if (Number(match[1]) > 12 && Number(match[2]) <= 12) orders.add("DMY");
    if (Number(match[2]) > 12 && Number(match[1]) <= 12) orders.add("MDY");
  }
  if (orders.size > 1) throw new Error("This migration mixes day-first and month-first dates. Use YYYY-MM-DD dates. Nothing was added.");
  return (orders.values().next().value as DateOrder | undefined) ?? null;
};
const migrationDate = (value: string, order: DateOrder): string | null => {
  const iso = value.match(/^(\d{4})[./-](\d{2})[./-](\d{2})(?:[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/);
  const local = numericDate(value);
  let year: number, month: number, day: number;
  if (iso) [, year, month, day] = iso.map(Number);
  else if (local && (order || Number(local[1]) === Number(local[2]))) {
    year = Number(local[3]);
    month = Number(local[order === "DMY" ? 2 : 1]);
    day = Number(local[order === "DMY" ? 1 : 2]);
  } else return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 1900 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date.toISOString().slice(0, 10) : null;
};

/** Source adapters normalize columns only. The established date/money parser remains authoritative. */
export const parseAppMigrationTable = (
  table: Table,
  context: ImportParseContext,
  parseCanonical: (text: string) => ParsedImportRow[],
  readAmount: (value: string, currency: string) => number | null
): ParsedImportRow[] | null => {
  const source = detectAppMigrationSource(table.headers);
  if (!source) return null;
  const keys = table.headers.map(key);
  const indexes = new Map<string, number>();
  keys.forEach((k, i) => {
    if (indexes.has(k) && k) throw new Error(`Duplicate migration column: ${table.headers[i]}. Remove the duplicate column before uploading. Nothing was added.`);
    if (!indexes.has(k)) indexes.set(k, i);
  });
  const get = (row: string[], ...names: string[]) => names.map(n => row[indexes.get(n) ?? -1]?.trim() ?? "").find(Boolean) ?? "";
  const fail = (row: number, message: string): never => { throw new Error(`Migration row ${row}: ${message} Nothing was added. Correct the file and upload again.`); };
  const strictSource = source === "ynab" || source === "monarch";
  const inferredDateOrder = strictSource ? dateOrderFrom(table.rows.map(cells => get(cells, "date"))) : null;
  const readSourceAmount = (value: string, currency: string, row: number) => {
    // A stray word, second number or formula must not become a plausible amount
    // merely because a tolerant document parser discards nonnumeric characters.
    if (!/^[+\-()\d.,\s$€£¥₱₩₹]+$/.test(value)) fail(row, "Use a numeric amount, optionally with a currency symbol.");
    const bare = value.replace(/[$€£¥₱₩₹]/g, "").trim();
    if (!/^(?:[+-]?[^()+-]+|\([^()+-]+\))$/.test(bare)) fail(row, "Use a single sign or parentheses around the amount.");
    const digits = bare.replace(/^[+-]|[()]/g, "").trim();
    // Recognize complete grouped/decimal numbers rather than concatenating
    // malformed values such as 12,34,56 or 10 20.
    if (!/^(?:\d+(?:[.,]\d{1,2})?|\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d{1,2})?)$/.test(digits)) fail(row, "The amount has invalid decimal or thousands separators.");
    let normalized = digits.replace(/[ \u00a0\u202f]/g, "");
    if (normalized.includes(",") && normalized.includes(".")) {
      normalized = normalized.lastIndexOf(",") > normalized.lastIndexOf(".")
        ? normalized.replaceAll(".", "").replace(",", ".") : normalized.replaceAll(",", "");
    } else if (/^\d{1,3}(?:,\d{3})+$/.test(normalized)) normalized = normalized.replaceAll(",", "");
    else if (normalized.includes(",")) normalized = normalized.replace(",", ".");
    else if (/^\d{1,3}(?:\.\d{3})+$/.test(normalized)) {
      if (currency.toUpperCase() !== "IDR" && normalized.split(".").length < 3) fail(row, "The amount has an ambiguous decimal separator. Use two decimal places.");
      normalized = normalized.replaceAll(".", "");
    }
    if (bare.startsWith("-") || bare.startsWith("(")) normalized = `-${normalized}`;
    const result = readAmount(normalized, currency);
    if (result === null || !Number.isSafeInteger(Math.round(result * 100)) || Math.abs(result * 100 - Math.round(result * 100)) > 0.0001) fail(row, "The amount cannot be read safely to two decimal places.");
    return result!;
  };
  const skipped: Array<{ row: number; reason: string }> = [];
  const prepared: Array<{ cells: string[]; sourceRow: number; name: string; originalStatement: string; note: string; categoryPath: string[]; tags: string[]; excluded: boolean; type: string; direction: "income" | "expense"; sourceId: string; splitGroup: string | null; line: string; canonical: string[]; destinationAccount: string; derivedTransferLeg?: boolean }> = [];
  let splitSequence = 0;
  let previousSplit = "";
  table.rows.forEach((cells, index) => {
    const sourceRow = table.headerIndex + index + 2;
    if (!cells.some(c => c.trim())) return;
    if (cells.map(key).join("|") === keys.join("|")) return;
    if (cells.length > table.headers.length && cells.slice(table.headers.length).some(c => c.trim())) fail(sourceRow, "There are more values than column headings.");
    const declared = get(cells, "migration_source").toLowerCase();
    if (source === "spreadsheet" && declared !== "spreadsheet") fail(sourceRow, 'Set Migration Source to "spreadsheet" when using the Clover template.');
    const status = get(cells, "status", "state").toLowerCase();
    if (/^(?:v|void|voided|pending|processing|scheduled|failed|declined|cancelled|canceled|reversed)$/.test(status) || /^(?:true|1|yes)$/i.test(get(cells, "pending"))) {
      skipped.push({ row: sourceRow, reason: status || "pending" }); return;
    }
    const category = get(cells, "category", "main_category");
    const subcategory = get(cells, "subcategory", "sub_category");
    const parent = get(cells, "parent_category", "category_group");
    const categoryPath = [parent, category, subcategory].filter((v, i, all) => v && all.indexOf(v) === i);
    if (!categoryPath.length && source === "ynab") categoryPath.push(...get(cells, "category_group_category").split(/\s*\/\s*/).filter(Boolean));
    const name = get(cells, "item_or_payee", "payee", "merchant", "name", "contents");
    const note = [get(cells, "note", "notes", "memo"), get(cells, "description", "details")].filter((v, i, all) => v && all.indexOf(v) === i).join(" · ");
    const label = name || note || categoryPath.at(-1) || "Imported transaction";
    let date = get(cells, "date", "period", "datetime", "transaction_date");
    if (source === "ynab" && /^starting balance$/i.test(name)) { skipped.push({ row: sourceRow, reason: "starting balance (not income)" }); return; }
    if (!date && /^(?:total|subtotal|opening balance|closing balance)$/i.test(label)) { skipped.push({ row: sourceRow, reason: "summary" }); return; }
    if (!date) fail(sourceRow, "A transaction date is required.");
    if (strictSource) {
      const declaredOrder = get(cells, "date_format").toUpperCase();
      if (declaredOrder && !["DMY", "MDY", "YYYY-MM-DD"].includes(declaredOrder)) fail(sourceRow, "Date Format must be DMY, MDY or YYYY-MM-DD.");
      if (declaredOrder === "YYYY-MM-DD" && !/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(sourceRow, "Use YYYY-MM-DD dates.");
      const order = declaredOrder === "DMY" || declaredOrder === "MDY" ? declaredOrder : inferredDateOrder;
      const normalized = migrationDate(date, order);
      if (!normalized) fail(sourceRow, "The date is invalid or ambiguous. Use YYYY-MM-DD, or add a Date Format column containing DMY or MDY.");
      date = normalized!;
    }
    const currency = get(cells, "currency", "currency_code") || context.currency || "";
    if (!/^[A-Z]{3}$/i.test(currency)) fail(sourceRow, "Add a three-letter Currency such as PHP, or select the account currency before uploading.");
    let amount = get(cells, "amount");
    let rawType = get(cells, "type", "income_expense", "direction", "record_type").toLowerCase().replace(/[_-]/g, " ");
    if (source === "ynab") {
      const inflowText = get(cells, "inflow"), outflowText = get(cells, "outflow");
      const inflow = inflowText ? readSourceAmount(inflowText, currency, sourceRow) : 0;
      const outflow = outflowText ? readSourceAmount(outflowText, currency, sourceRow) : 0;
      if (inflow < 0 || outflow < 0 || (inflow !== 0 && outflow !== 0)) fail(sourceRow, "Use one nonnegative Inflow or Outflow per transaction, not both.");
      const transfer = /^transfer\s*:/i.test(name);
      rawType = transfer ? (inflow ? "transfer in" : "transfer out") : (inflow ? "income" : "expense");
      amount = String(inflow || outflow);
      if (transfer && !categoryPath.length) categoryPath.push("Transfers");
    } else if (source === "monarch") {
      const signed = readSourceAmount(amount, currency, sourceRow);
      amount = String(signed);
      if (/^(?:t|transfer)$/.test(rawType)) rawType = signed < 0 ? "transfer out" : "transfer in";
      if (!rawType) rawType = /^(?:transfers?|credit card payments?)$/i.test(category) || /^transfers?$/i.test(parent)
        ? (signed < 0 ? "transfer out" : "transfer in") : signed < 0 ? "expense" : "income";
    }
    if (!amount) fail(sourceRow, "A transaction amount is required.");
    let type!: "income" | "expense" | "transfer";
    if (/^(?:i|income|credit|pemasukan)$/.test(rawType)) type = "income";
    else if (/^(?:e|expense|expenses|debit|pengeluaran)$/.test(rawType)) type = "expense";
    else if (/^(?:t|transfer|transfer in|transfer out|transfer from|transfer to)$/.test(rawType)) type = "transfer";
    else if (rawType) fail(sourceRow, `Unrecognized transaction type "${rawType}". Use Income, Expense or Transfer.`);
    else if (/^\s*[-(]/.test(amount)) type = "expense";
    else if (/^\s*\+/.test(amount)) type = "income";
    else fail(sourceRow, "Choose Income or Expense in the Type column for an unsigned amount.");
    const direction = /\b(?:in|from)\b/.test(rawType) ? "income" : /\b(?:out|to)\b/.test(rawType) ? "expense" : /^\s*-/.test(amount) ? "expense" : type === "income" || type === "transfer" ? "income" : "expense";
    if (source === "monarch" && ((type === "income" && Number(amount) < 0) || (type === "expense" && Number(amount) > 0) ||
      (type === "transfer" && (direction === "income") !== (Number(amount) > 0)))) fail(sourceRow, "The Type conflicts with Monarch's signed amount. Positive is incoming and negative is outgoing.");
    if (type === "transfer" && source !== "bluecoins" && !/[+-]/.test(amount[0] ?? "") && !/\b(?:in|out|from|to)\b/.test(rawType)) fail(sourceRow, "Use a signed amount or Transfer In/Transfer Out to identify the transfer direction.");
    const account = get(cells, "account", "accounts", "wallet", "account_name") || context.accountName || "Cash";
    if (strictSource && !get(cells, "account")) fail(sourceRow, "An Account name is required for every source transaction.");
    const excludedText = get(cells, "excluded", "exclude_from_reports", "is_excluded", "hidden").toLowerCase();
    if (excludedText && !/^(?:true|false|yes|no|0|1)$/.test(excludedText)) fail(sourceRow, "Excluded must be true or false.");
    const tags = get(cells, "tags", "labels", "label").split(source === "bluecoins" ? /\s+/ : /[;|,]/).map(x => x.trim()).filter(Boolean);
    const flag = source === "ynab" ? get(cells, "flag", "flag_name") : "";
    if (flag) tags.push(`YNAB: ${flag}`);
    const cleanTags = sanitizeTransactionTagNames(tags);
    if (tags.some(t => t.length > 40) || new Set(tags.map(t => t.toLowerCase())).size > 20) fail(sourceRow, "Use no more than 20 tags, each up to 40 characters.");
    const split = get(cells, "split", "split_id");
    const splitIdentity = split ? `${account}|${date}|${label}` : "";
    if (splitIdentity && splitIdentity !== previousSplit) splitSequence += 1;
    previousSplit = splitIdentity;
    const splitGroup = split ? `${source}:${splitSequence}:${splitIdentity}` : null;
    const sourceId = get(cells, "id", "transaction_id", "reference");
    const destinationAccount = source === "realbyte" && type === "transfer" && direction === "expense" ? category : "";
    if (destinationAccount) categoryPath.splice(0, categoryPath.length, "Transfers");
    const canonical = [date, label, amount, currency.toUpperCase(), account, categoryPath.join(" / "), type, `migration-${prepared.length}`, get(cells, "account_type"), get(cells, "balance"), get(cells, "institution", "bank"), get(cells, "account_number")];
    const line = csv(canonical);
    prepared.push({ cells, sourceRow, name: name || label, originalStatement: get(cells, "original_statement"), note, categoryPath, tags: cleanTags, excluded: /^(?:true|yes|1)$/.test(excludedText), type, direction, sourceId, splitGroup, line, canonical, destinationAccount });
  });
  // Realbyte's documented template encodes a transfer-out destination in
  // Category. Materialize the other leg only when it is absent from the file.
  const originalPrepared = [...prepared];
  const pairedIncoming = new Set<number>();
  for (const outgoing of originalPrepared) {
    if (!outgoing.destinationAccount) continue;
    if (outgoing.destinationAccount === outgoing.canonical[4]) fail(outgoing.sourceRow, "A transfer must use two different accounts.");
    const counterpart = originalPrepared.findIndex((r, index) => !pairedIncoming.has(index) && r.type === "transfer" && r.direction === "income" && r.canonical[4] === outgoing.destinationAccount && r.canonical[0] === outgoing.canonical[0] && r.canonical[2].replace(/^[+-]/, "") === outgoing.canonical[2].replace(/^[+-]/, "") && r.canonical[3] === outgoing.canonical[3]);
    if (counterpart !== -1) { pairedIncoming.add(counterpart); continue; }
    if (originalPrepared.some(r => r.canonical[4] === outgoing.destinationAccount && r.canonical[3] !== outgoing.canonical[3])) fail(outgoing.sourceRow, "Use two explicit transfer legs with their own amounts and currencies for a cross-currency transfer.");
    const canonical = [...outgoing.canonical];
    canonical[2] = canonical[2].replace(/^-/, "+");
    canonical[4] = outgoing.destinationAccount;
    canonical[7] = `migration-${prepared.length}`;
    canonical[8] = canonical[9] = canonical[10] = canonical[11] = "";
    prepared.push({ ...outgoing, canonical, line: csv(canonical), direction: "income", destinationAccount: "", sourceId: outgoing.sourceId ? `${outgoing.sourceId}:incoming` : "", derivedTransferLeg: true });
  }
  if (!prepared.length) throw new Error(`This migration contains no completed transactions. ${skipped.length} pending, void or summary rows were skipped. Nothing was added.`);
  const parsed = parseCanonical(["Date,Description,Amount,Currency,Account,Category,Type,Reference,Account Type,Balance,Institution,Account Number", ...prepared.map(r => r.line)].join("\n"));
  const byReference = new Map(parsed.map(r => [r.rawPayload?.reference, r]));
  const seenIds = new Map<string, string>();
  const rows: ParsedImportRow[] = [];
  const totals = new Map<string, { account: string; currency: string; income: number; expense: number; transferIn: number; transferOut: number; excluded: number; rows: number }>();
  prepared.forEach((sourceRow, i) => {
    const row = byReference.get(`migration-${i}`);
    if (!row?.date || !row.amount || !row.currency) fail(sourceRow.sourceRow, "The date or amount could not be read safely (zero-value entries are not supported).");
    const r = { ...row!, accountName: sourceRow.canonical[4], currency: sourceRow.canonical[3] };
    const signature = JSON.stringify([r.date, r.amount, r.currency, r.accountName, sourceRow.direction, sourceRow.name, sourceRow.originalStatement, sourceRow.note, sourceRow.categoryPath, sourceRow.tags, sourceRow.excluded, sourceRow.type]);
    const idKey = JSON.stringify([r.accountName, r.currency, sourceRow.sourceId]);
    if (sourceRow.sourceId && seenIds.has(idKey)) {
      if (seenIds.get(idKey) !== signature) fail(sourceRow.sourceRow, "The same transaction ID contains conflicting values.");
      skipped.push({ row: sourceRow.sourceRow, reason: "duplicate source ID" }); return;
    }
    if (sourceRow.sourceId) seenIds.set(idKey, signature);
    const evidence: MigrationEvidence = { version: 1, source, sourceRow: sourceRow.sourceRow, sourceId: sourceRow.sourceId, categoryPath: sourceRow.categoryPath, tags: sourceRow.tags, excluded: sourceRow.excluded, direction: sourceRow.direction, splitGroup: sourceRow.splitGroup, ...(sourceRow.derivedTransferLeg ? { derivedTransferLeg: true } : {}) };
    const categoryName = sourceRow.categoryPath.join(" / ") || (sourceRow.type === "transfer" ? "Transfers" : "Other");
    rows.push({ ...r, merchantRaw: sourceRow.originalStatement || sourceRow.name, merchantClean: sourceRow.name, description: sourceRow.note || sourceRow.name, categoryName, type: sourceRow.type as ParsedImportRow["type"], parserConfidence: 100, categoryConfidence: sourceRow.categoryPath.length ? 100 : 35, confidence: sourceRow.categoryPath.length ? 100 : 70,
      rawPayload: { ...r.rawPayload, source: "structured_transaction_csv", accountName: r.accountName, accountCurrency: r.currency, originalHeaders: table.headers, sourceCells: sourceRow.cells, originalStatement: sourceRow.originalStatement || null, sourceRowIndex: sourceRow.sourceRow, description: sourceRow.note || sourceRow.name, appMigration: evidence, parsedDirectionType: sourceRow.direction, reference: sourceRow.sourceId || null,
        ...(r.rawPayload?.balanceReconciliation === "mismatch" ? { reviewRequired: true, reviewReason: "The running balance does not match this movement. Check the source export.", reviewReasons: ["The running balance does not match this movement. Check the source export."] } : {}) } });
    const groupKey = JSON.stringify([r.accountName, r.currency]);
    const total = totals.get(groupKey) ?? { account: r.accountName || "Cash", currency: r.currency!, income: 0, expense: 0, transferIn: 0, transferOut: 0, excluded: 0, rows: 0 };
    const minor = Math.round(Number(r.amount) * 100);
    total.rows += 1;
    if (sourceRow.excluded) total.excluded += minor;
    else if (sourceRow.type === "transfer") total[sourceRow.direction === "income" ? "transferIn" : "transferOut"] += minor;
    else total[sourceRow.type as "income" | "expense"] += minor;
    totals.set(groupKey, total);
  });
  if (rows[0]) rows[0].rawPayload = { ...rows[0].rawPayload, migrationSummary: { source, inputRows: originalPrepared.length + skipped.filter(s => s.reason !== "duplicate source ID").length, importedRows: rows.length, derivedTransferRows: rows.filter(row => readAppMigration(row.rawPayload)?.derivedTransferLeg).length, skippedRows: skipped, totals: [...totals.values()].map(t => ({ ...t, income: t.income / 100, expense: t.expense / 100, transferIn: t.transferIn / 100, transferOut: t.transferOut / 100, excluded: t.excluded / 100 })) } };
  return rows;
};

/** Exact occurrence matching preserves legitimate repeated identical transactions. */
export const createMigrationOverlapMatcher = (existing: Array<Record<string, unknown>>) => {
  const identity = (row: Record<string, unknown>) => {
    const migration = readAppMigration(row.rawPayload);
    if (!migration) return null;
    const date = row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date ?? "").slice(0, 10);
    if (migration.sourceId) return JSON.stringify([row.accountId, row.currency, migration.source, migration.sourceId]);
    return JSON.stringify([row.accountId, date, Number(row.amount).toFixed(2), row.currency, migration.direction, migration.source,
      [row.merchantRaw, row.description].map(v => String(v ?? "").trim()).join("\u0000")]);
  };
  const counts = new Map<string, number>();
  existing.forEach(row => { const k = identity(row); if (k) counts.set(k, (counts.get(k) ?? 0) + 1); });
  return (row: Record<string, unknown>) => { const k = identity(row); if (!k || !counts.get(k)) return false; counts.set(k, counts.get(k)! - 1); return true; };
};

export const summarizeAppMigration = (rows: Array<{ rawPayload?: unknown }>) => {
  const summaries = rows.map(row => object(object(row.rawPayload)?.migrationSummary)).filter((value): value is Record<string, unknown> => Boolean(value));
  if (!summaries.length) return null;
  return {
    sourceRows: summaries.reduce((sum, s) => sum + Number(s.inputRows ?? 0), 0),
    parsedRows: summaries.reduce((sum, s) => sum + Number(s.importedRows ?? 0), 0),
    derivedTransferRows: summaries.reduce((sum, s) => sum + Number(s.derivedTransferRows ?? 0), 0),
    skippedRows: summaries.flatMap(s => Array.isArray(s.skippedRows) ? s.skippedRows : []),
    accountTotals: summaries.flatMap(s => Array.isArray(s.totals) ? s.totals : []),
  };
};
