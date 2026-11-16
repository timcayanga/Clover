import { detectCurrencyEvidence } from "@/lib/financial-identity-detection";
import { indonesianFinancialHeader, normalizeIndonesianText } from "@/lib/indonesian-financial-text";
import { isIndonesianStatementPeriodLine, readIndonesianStatementPeriod, resolveIndonesianStatementDate } from "@/lib/indonesian-statement-period";

export const indonesianBankColumnKey = (value: string) => {
  const label = normalizeIndonesianText(value).toLowerCase();
  if (/^(?:cabang|cbg|kode cabang)$/.test(label)) return "branch";
  if (label === "jumlah") return "amount";
  return indonesianFinancialHeader(value);
};

const fields = (line: string) => {
  const explicit = line.trim().split(/\t|\s{2,}|\|/).map(cell => cell.trim());
  if (explicit.length >= 3) return explicit;
  const pattern = /tanggal(?: transaksi| pembukuan)?|tgl(?: transaksi)?|keterangan|uraian|deskripsi|mutasi(?: debet| debit| kredit)?|debet|debit|kredit|saldo(?: akhir)?|nominal|jumlah|kode cabang|cabang|cbg|db\/cr/gi;
  const matches = [...line.matchAll(pattern)];
  return matches.length >= 3 && !line.replace(pattern, "").trim() ? matches.map(match => match[0]) : explicit;
};
export function looksLikeIndonesianBankTableHeader(line: string) {
  const keys = fields(normalizeIndonesianText(line)).map(indonesianBankColumnKey);
  return (keys.some(key => key === "date" || key === "posted_date") && keys.includes("description") && keys.some(key => ["amount", "debit", "credit"].includes(key ?? ""))) ||
    /\b(?:tanggal|tgl)\b/i.test(line) && /\b(?:keterangan|uraian|deskripsi)\b/i.test(line) && /\b(?:mutasi|debet|debit|kredit|nominal|jumlah)\b/i.test(line);
}
export function indonesianBankTableHeader(line: string): string[] | null {
  const columns = fields(normalizeIndonesianText(line)), keys = columns.map(indonesianBankColumnKey);
  return columns.length >= 3 && columns.length <= 10 && keys.some(key => ["date", "posted_date"].includes(key ?? "")) && keys.includes("description") &&
    new Set(keys).size === keys.length && keys.every(key => ["date", "posted_date", "description", "amount", "debit", "credit", "balance", "type", "reference", "branch"].includes(key ?? "")) &&
    keys.some(key => ["amount", "debit", "credit"].includes(key ?? "")) ? columns : null;
}
const metadataLine = (line: string) => line.match(/^(nama bank|nama rekening|nomor rekening|no\.? rekening|no\.? rek|nomor kartu|jenis rekening|mata uang|kode mata uang|satuan)\s*[:=]\s*(.+)$/i);
const escape = (value: string) => /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

/** Only intact, labeled columns are eligible. Recognized broken layouts never enter last-number fallback. */
export function buildIndonesianBankTable(text: string) {
  const originals = text.split(/\r?\n/), lines = originals.map(normalizeIndonesianText);
  const start = lines.findIndex(looksLikeIndonesianBankTableHeader);
  if (start < 0) return null;
  const unsafe = { csv: null, sourceLines: [] };
  const headers = indonesianBankTableHeader(lines[start]!);
  const currency = detectCurrencyEvidence(text);
  const {period,invalid} = readIndonesianStatementPeriod(lines);
  if (!headers || !currency.currency || currency.ambiguous || invalid) return unsafe;
  const keys = headers.map(indonesianBankColumnKey);
  const dateIndex = keys.includes("date") ? keys.indexOf("date") : keys.indexOf("posted_date");
  const descriptionIndex = keys.indexOf("description");
  type SourceLine = {text:string;lineNumber:number;sourceDateText?:string;dateFromPeriod?:boolean;statementPeriod?:typeof period;continuationLines?:Array<{text:string;lineNumber:number}>};
  const rows: string[][] = [], sourceLines: Array<SourceLine | null> = [];
  const seen = new Map<string, string>();
  const add = (cells: string[], index?: number, dateContext?: Partial<SourceLine>) => { rows.push(cells); sourceLines.push(index === undefined ? null : {text: originals[index]!, lineNumber: index + 1,...dateContext}); };
  const addMetadata = (line: string, inTable: boolean) => {
    const match = metadataLine(line);
    if (!match) return null;
    const key = indonesianFinancialHeader(match[1]!) ?? "money_unit", value = match[2]!;
    if (seen.has(key) && seen.get(key) !== value && !(key === "money_unit" && inTable)) return false;
    seen.set(key, value); add([match[1]!, value]); return true;
  };
  add(["Mata uang", currency.currency]);
  for (const line of lines.slice(0, start)) {
    if (addMetadata(line, false) === false) return unsafe;
    if (/^\d{1,4}[/-]\d{1,2}[/-]\d{1,4}\s{2,}\S/.test(line)) return unsafe;
  }
  add(headers.map((header, index) => keys[index] === "amount" && header.toLowerCase() === "jumlah" ? "Nominal" : header));
  let count = 0;
  let lastTransactionIndex: number | null = null;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (!line || /^[-=_\s]+$/.test(line) || /^(?:halaman\s*)?\d+\s*(?:\/|dari)\s*\d+$/i.test(line)) continue;
    if (isIndonesianStatementPeriodLine(line)) { lastTransactionIndex = null; continue; }
    const repeated = indonesianBankTableHeader(line);
    if (repeated) { if (repeated.join("|").toLowerCase() !== headers.join("|").toLowerCase()) return unsafe; lastTransactionIndex = null; continue; }
    const metadata = addMetadata(line, true);
    if (metadata === false) return unsafe;
    if (metadata) { lastTransactionIndex = null; continue; }
    if (/^(?:saldo awal|saldo akhir|total (?:mutasi|debet|debit|kredit)|jumlah mutasi|tanggal cetak|dicetak pada)\s*[:=]/i.test(line)) { lastTransactionIndex = null; continue; }
    // Split the original line: trimming first would erase empty edge columns.
    const original = originals[index]!;
    const cells = original.includes("\t") ? original.split("\t") : original.includes("|") ? original.split("|") : line.split(/ {2,}/);
    const values = cells.map(normalizeIndonesianText);
    if (values.length !== headers.length) return unsafe;
    const populated = values.flatMap((value, column) => value ? [column] : []);
    if (lastTransactionIndex !== null && populated.length === 1 && populated[0] === descriptionIndex) {
      const previous = rows[lastTransactionIndex]!;
      const source = sourceLines[lastTransactionIndex]!;
      previous[descriptionIndex] = `${previous[descriptionIndex]} ${values[descriptionIndex]}`;
      source.text += `\n${original}`;
      source.continuationLines = [...(source.continuationLines ?? []), {text:original,lineNumber:index+1}];
      continue;
    }
    const date = resolveIndonesianStatementDate(values[dateIndex] ?? "",period);
    if (!date || !values[descriptionIndex]) return unsafe;
    const normalizedValues = [...values]; normalizedValues[dateIndex] = date.date;
    add(normalizedValues, index, {sourceDateText:values[dateIndex],dateFromPeriod:date.fromPeriod,statementPeriod:period});
    lastTransactionIndex = rows.length - 1; count += 1;
  }
  return count ? {csv: rows.map(row => row.map(escape).join(",")).join("\n"), sourceLines, headers} : unsafe;
}
