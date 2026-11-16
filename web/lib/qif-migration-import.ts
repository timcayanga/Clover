import type { ImportParseContext, ImportedAccountType, ParsedImportRow } from "@/lib/import-parser";
import { migrationDate, migrationDateOrderFrom, type MigrationEvidence } from "@/lib/app-migration-import";
import { sanitizeTransactionTagNames } from "@/lib/transaction-tags";

const accountTypes: Record<string, ImportedAccountType> = { bank: "bank", cash: "cash", ccard: "credit_card", "oth a": "other", "oth l": "payable" };
const fail = (line: number, message: string): never => { throw new Error(`QIF line ${line}: ${message} Nothing was added. Correct the export and upload again.`); };
type RecordBlock = { section: string; sectionIndex: number; line: number; lines: string[]; account: string; accountType?: ImportedAccountType };
// QIF amounts use signed decimal units. Do not strip malformed input into money.
const minorUnits = (value: string, line: number) => {
  if (!/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value)) fail(line, "Use decimal-point amounts with optional comma thousands separators.");
  const [whole, fraction = ""] = value.replaceAll(",", "").replace(/^[+-]/, "").split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) fail(line, "The amount is too large to read safely.");
  return value.startsWith("-") ? -cents : cents;
};
const qifDate = (value: string) => {
  const compact = value.replace(/\s/g, "");
  const local = compact.match(/^(\d{1,2})\/(\d{1,2})(['/])(\d{1,4})$/);
  if (!local) return compact;
  const year = Number(local[4]);
  if (local[4].length === 3) return "";
  const full = local[4].length === 4 ? year : local[3] === "'" ? 2000 + year : year >= 70 ? 1900 + year : 2000 + year;
  return `${local[1]}/${local[2]}/${full}`;
};
const readCategory = (value: string, line: number) => {
  const slash = value.indexOf("/");
  const category = (slash < 0 ? value : value.slice(0, slash)).trim();
  const className = slash < 0 ? "" : value.slice(slash + 1).trim();
  const transfer = category.match(/^\[([^\[\]]+)\]$/);
  if (/[\[\]]/.test(category) && !transfer) fail(line, "The transfer account brackets are incomplete.");
  const categoryPath = transfer ? ["Transfers"] : category.split(":").map(s => s.trim()).filter(Boolean);
  const tags = className ? sanitizeTransactionTagNames([`QIF: ${className}`]) : [];
  if (className && tags[0] !== `QIF: ${className}`) fail(line, "Shorten the QIF class to fit a 40-character Clover tag.");
  return { categoryPath, tags, transferAccount: transfer?.[1]?.trim() ?? null };
};

/** Non-investment QIF only. Preserve source records, validate the whole file,
 * and use the same source-preserving persistence path as CSV migrations. */
export const parseQifMigration = (text: string, context: ImportParseContext): ParsedImportRow[] | null => {
  const sourceLines = text.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/);
  if (!/^!(?:Type:|Account\s*$|Option:)/i.test(sourceLines.find(line => line.trim())?.trim() ?? "")) return null;
  const blocks: RecordBlock[] = [];
  let section = "", account = context.accountName?.trim() ?? "", accountType: ImportedAccountType | undefined;
  let accountDefinitions = 0, sectionIndex = 0, recordLine = 1, lines: string[] = [];
  const flush = () => {
    if (!lines.length) return;
    if (section === "account") {
      const names = lines.filter(l => l.startsWith("N"));
      const types = lines.filter(l => l.startsWith("T"));
      if (names.length !== 1 || !names[0].slice(1).trim() || types.length > 1) fail(recordLine, "An account record needs one name and at most one type.");
      account = names[0].slice(1).trim();
      accountType = accountTypes[types[0]?.slice(1).trim().toLowerCase() ?? ""];
      accountDefinitions++;
    } else if (["cat", "class", "memorized"].includes(section)) {
      // These are definitions/schedules, not historical financial movements.
    } else if (accountTypes[section]) {
      if (accountDefinitions > 1) fail(recordLine, "This account list does not identify which account owns the transactions. Export each account separately.");
      if (accountType && accountType !== accountTypes[section]) fail(recordLine, "The transaction section conflicts with its account type.");
      blocks.push({ section, sectionIndex, line: recordLine, lines, account, accountType: accountTypes[section] });
    } else fail(recordLine, `Unsupported QIF section ${section || "(missing)"}. Export bank, cash or credit-card history separately from investment/business records.`);
    lines = [];
  };
  sourceLines.forEach((sourceLine, index) => {
    const line = sourceLine.trim();
    if (!line) return;
    if (line.startsWith("!")) {
      if (lines.length) fail(index + 1, "A record is missing its ^ terminator.");
      if (/^!(?:Option|Clear):(?:AutoSwitch|AllXfr)$/i.test(line)) return;
      if (/^!Account$/i.test(line)) { section = "account"; accountDefinitions = 0; accountType = undefined; }
      else if (/^!Type:/i.test(line)) { section = line.slice(6).trim().toLowerCase(); sectionIndex++; }
      else fail(index + 1, "The QIF section header is not supported.");
    } else if (line === "^") flush();
    else { if (!lines.length) recordLine = index + 1; lines.push(sourceLine); }
  });
  if (lines.length) fail(recordLine, "The last record is missing its ^ terminator.");
  if (!blocks.length) fail(1, "No supported transaction records were found.");
  if (blocks.length > 25000) fail(1, "Import up to 25,000 transaction records at a time.");
  const currency = context.currency?.trim().toUpperCase() ?? "";
  if (!/^[A-Z]{3}$/.test(currency)) fail(1, "QIF does not identify currencies. Select an account with the original currency, or use Clover's CSV template with a Currency column.");
  const dateOrder = migrationDateOrderFrom(blocks.flatMap(b => b.lines.filter(l => l.startsWith("D")).map(l => qifDate(l.slice(1)))));
  const rows: ParsedImportRow[] = [], skipped: Array<{ row: number; reason: string }> = [];
  const totals = new Map<string, { account: string; currency: string; income: number; expense: number; transferIn: number; transferOut: number; excluded: number; rows: number }>();
  for (const block of blocks) {
    const fields = new Map<string, string>();
    const splits: Array<{ category: string; memo: string; amount?: string }> = [];
    for (const line of block.lines) {
      const code = line[0], value = line.slice(1).trim();
      if (code === "S") splits.push({ category: value, memo: "" });
      else if (code === "E" || code === "$") {
        const split = splits.at(-1);
        if (!split || (code === "$" && split.amount !== undefined) || (code === "E" && split.memo)) fail(block.line, "A split has missing or duplicate fields.");
        if (code === "E") split!.memo = value; else split!.amount = value;
      } else if (code === "A") { /* Postal address stays in the original record. */ }
      else if ("DTCNPMLU".includes(code)) {
        if (fields.has(code)) fail(block.line, `Duplicate ${code} field.`);
        fields.set(code, value);
      } else fail(block.line, `Unsupported transaction field ${code}. Use an itemized CSV export instead.`);
    }
    const date = migrationDate(qifDate(fields.get("D") ?? ""), dateOrder);
    if (!date) fail(block.line, "The date is invalid or ambiguous. Use YYYY-MM-DD dates, or Clover's CSV template with Date Format set to DMY or MDY.");
    const amount = minorUnits(fields.get("T") ?? fields.get("U") ?? "", block.line);
    if (fields.has("T") && fields.has("U") && minorUnits(fields.get("U")!, block.line) !== amount) fail(block.line, "The T and U amounts disagree.");
    const payee = fields.get("P") ?? "", memo = fields.get("M") ?? "";
    if (!splits.length && /^(?:--|—)split(?:--|—)$/i.test(fields.get("L") ?? "")) fail(block.line, "The split category is present but its individual parts are missing.");
    const category = readCategory(fields.get("L") ?? "", block.line);
    if (/^(?:opening|starting) balance$/i.test(payee) && !splits.length) {
      if (!block.account && category.transferAccount) {
        // Microsoft Money's first opening-balance record can name the account.
        const remaining = blocks.slice(blocks.indexOf(block) + 1);
        for (const next of remaining) { if (next.account || next.sectionIndex !== block.sectionIndex) break; next.account = category.transferAccount; }
      }
      skipped.push({ row: block.line, reason: "opening balance (not income)" }); continue;
    }
    if (!block.account) fail(block.line, "Choose an account or export the QIF with account information.");
    const parts = splits.length ? splits.map(s => ({ ...s, minor: minorUnits(s.amount ?? "", block.line) }))
      : [{ category: fields.get("L") ?? "", memo: "", amount: fields.get("T") ?? fields.get("U")!, minor: amount }];
    const sum = parts.reduce((n, p) => {
      if (!Number.isSafeInteger(n + p.minor)) fail(block.line, "The split total is too large to read safely.");
      return n + p.minor;
    }, 0);
    if (!Number.isSafeInteger(sum) || sum !== amount) fail(block.line, "The split amounts do not equal the transaction total.");
    if (splits.length && parts.some(p => p.minor === 0)) fail(block.line, "Zero-value split parts are unsupported. Remove the empty part or use an itemized CSV.");
    if (!splits.length && amount === 0) { skipped.push({ row: block.line, reason: "zero amount" }); continue; }
    for (const [index, part] of parts.entries()) {
      if (rows.length >= 25000) fail(block.line, "Import up to 25,000 individual transactions or split parts at a time.");
      const meta = readCategory(part.category, block.line);
      const direction = part.minor > 0 ? "income" : "expense";
      const type = meta.transferAccount ? "transfer" : direction;
      const description = [...new Set([memo, part.memo].filter(Boolean))].join(" · ") || payee || "Imported transaction";
      const migration: MigrationEvidence = { version: 1, source: "qif", sourceRow: block.line, sourceId: "", categoryPath: meta.categoryPath, tags: meta.tags, excluded: false, direction, splitGroup: splits.length ? `qif:${block.line}:${block.account}:${date}` : null };
      const reason = meta.categoryPath.length ? null : "Choose a category for this imported transaction.";
      rows.push({ date: date!, amount: (Math.abs(part.minor) / 100).toFixed(2), currency, merchantRaw: payee || description, merchantClean: payee || description, description, categoryName: meta.categoryPath.join(" / ") || "Other", accountName: block.account, type, confidence: reason ? 70 : 100, parserConfidence: 100, categoryConfidence: reason ? 35 : 100,
        rawPayload: { kind: "financial_exchange_transaction", format: "qif", appMigration: migration, description, accountName: block.account, accountCurrency: currency, currencyEvidence: "import_context", accountType: block.accountType, parsedDirectionType: direction, rawAmount: part.minor / 100,
          // Original record is separate from the normalized migration identity.
          qifRecord: { lines: block.lines, section: block.section, sourceLine: block.line, parentAmount: amount / 100, splitIndex: splits.length ? index + 1 : null, splitCount: splits.length, transferAccount: meta.transferAccount },
          category: part.category, number: fields.get("N") ?? null, clearedStatus: fields.get("C") ?? null,
          originalHeaders: ["Date", "Payee", "Notes", "Amount", "Category"], sourceCells: [fields.get("D")!, payee, description, part.amount!, part.category],
          ...(reason ? { reviewRequired: true, reviewReason: reason, reviewReasons: [reason] } : {}) } });
      const total = totals.get(block.account) ?? { account: block.account, currency, income: 0, expense: 0, transferIn: 0, transferOut: 0, excluded: 0, rows: 0 };
      const bucket = type === "transfer" ? direction === "income" ? "transferIn" : "transferOut" : direction;
      if (!Number.isSafeInteger(total[bucket] + Math.abs(part.minor))) fail(block.line, "The account total is too large to read safely.");
      total.rows++; total[bucket] += Math.abs(part.minor);
      totals.set(block.account, total);
    }
  }
  if (!rows.length) fail(1, "The file contains only opening balances or zero-value entries. Upload transaction history instead.");
  rows[0].rawPayload = { ...rows[0].rawPayload, migrationSummary: { source: "qif", inputRows: blocks.length, importedRows: rows.length, derivedTransferRows: 0, skippedRows: skipped, totals: [...totals.values()].map(t => ({ ...t, income: t.income / 100, expense: t.expense / 100, transferIn: t.transferIn / 100, transferOut: t.transferOut / 100 })) } };
  return rows;
};
