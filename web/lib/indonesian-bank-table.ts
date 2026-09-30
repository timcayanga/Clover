import { detectCurrencyEvidence } from "@/lib/financial-identity-detection";
import { indonesianFinancialHeader, normalizeIndonesianText, parseIndonesianDate } from "@/lib/indonesian-financial-text";

const fields = (line: string) => {
  const explicit = line.trim().split(/\t|\s{2,}|\|/).map(cell => cell.trim());
  if (explicit.length >= 3) return explicit;
  const pattern = /tanggal(?: transaksi| pembukuan)?|tgl(?: transaksi)?|keterangan|uraian|deskripsi|mutasi(?: debet| debit| kredit)?|debet|debit|kredit|saldo(?: akhir)?|nominal|db\/cr/gi;
  const matches = [...line.matchAll(pattern)];
  return matches.length >= 3 && !line.replace(pattern, "").trim() ? matches.map(match => match[0]) : explicit;
};
export function looksLikeIndonesianBankTableHeader(line: string) {
  const keys = fields(normalizeIndonesianText(line)).map(indonesianFinancialHeader);
  return (keys.some(key => key === "date" || key === "posted_date") && keys.includes("description") && keys.some(key => ["amount", "debit", "credit"].includes(key ?? ""))) ||
    /\b(?:tanggal|tgl)\b/i.test(line) && /\b(?:keterangan|uraian|deskripsi)\b/i.test(line) && /\b(?:mutasi|debet|debit|kredit|nominal)\b/i.test(line);
}
export function indonesianBankTableHeader(line: string): string[] | null {
  const columns = fields(normalizeIndonesianText(line)), keys = columns.map(indonesianFinancialHeader);
  return columns.length >= 3 && columns.length <= 7 && ["date", "posted_date"].includes(keys[0] ?? "") && keys[1] === "description" &&
    new Set(keys).size === keys.length && keys.slice(2).every(key => ["amount", "debit", "credit", "balance", "type", "reference"].includes(key ?? "")) &&
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
  if (!headers || !currency.currency || currency.ambiguous) return unsafe;
  const rows: string[][] = [], sourceLines: Array<{text:string;lineNumber:number} | null> = [];
  const seen = new Map<string, string>();
  const add = (cells: string[], index?: number) => { rows.push(cells); sourceLines.push(index === undefined ? null : {text: originals[index]!, lineNumber: index + 1}); };
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
  add(headers);
  let count = 0;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (!line || /^[-=_\s]+$/.test(line) || /^(?:halaman\s*)?\d+\s*(?:\/|dari)\s*\d+$/i.test(line)) continue;
    const repeated = indonesianBankTableHeader(line);
    if (repeated) { if (repeated.join("|").toLowerCase() !== headers.join("|").toLowerCase()) return unsafe; continue; }
    const metadata = addMetadata(line, true);
    if (metadata === false) return unsafe;
    if (metadata) continue;
    if (/^(?:saldo awal|saldo akhir|total (?:mutasi|debet|debit|kredit)|jumlah mutasi|tanggal cetak|dicetak pada)\s*[:=]/i.test(line)) continue;
    const cells = line.includes("\t") ? line.split("\t") : line.includes("|") ? line.split("|") : line.split(/ {2,}/);
    const values = cells.map(cell => cell.trim());
    if (values.length !== headers.length || !parseIndonesianDate(values[0] ?? "") || !values[1]) return unsafe;
    add(values, index); count += 1;
  }
  return count ? {csv: rows.map(row => row.map(escape).join(",")).join("\n"), sourceLines} : unsafe;
}
