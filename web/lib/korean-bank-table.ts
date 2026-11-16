import { detectCurrencyEvidence } from "@/lib/financial-identity-detection";
import { koreanFinancialHeader, normalizeKoreanFinancialText, parseKoreanDate } from "@/lib/korean-financial-text";

const headerCells = (line: string) => normalizeKoreanFinancialText(line).trim()
  .replace(/\s+([([][^)\]]+[)\]])/g, "$1").split(/[\s|]+/);

export function looksLikeKoreanBankTableHeader(line: string) {
  const keys = headerCells(line).map(koreanFinancialHeader);
  return keys.some(key => key === "date" || key === "posted_date") &&
    keys.some(key => key === "description" || key === "merchant") &&
    keys.some(key => ["amount", "debit", "credit"].includes(key ?? ""));
}

export function koreanBankTableHeader(line: string): string[] | null {
  const headers = headerCells(line);
  const keys = headers.map(koreanFinancialHeader);
  return keys.length >= 3 && keys.length <= 5 && keys[0] === "date" &&
    ["description", "merchant"].includes(keys[1] ?? "") && new Set(keys).size === keys.length &&
    keys.slice(2).every(key => ["amount", "debit", "credit", "balance"].includes(key ?? "")) &&
    keys.some(key => ["amount", "debit", "credit"].includes(key ?? "")) ? headers : null;
}

const escapeCell = (value: string) => /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
const metadataLine = (line: string) => line.match(/^(은행명|은행|금융기관|계좌명|계좌번호|카드번호|계좌유형|통화|통화코드|청구통화|결제통화|단위|금액단위)\s*[:：]\s*(.+)$/);
const looksDated = (line: string) => /^\d{4}(?:\s*년|[./-]|\d{4}(?:\D|$))/.test(line);

/** Null means another format; csv:null means a recognized but unsafe table.
 * Only explicit cell separators establish columns. Never guess a missing debit
 * from the last number in a merchant name or use the final balance as spending.
 */
export function buildKoreanBankTable(text: string) {
  const originalLines = text.split(/\r?\n/);
  const lines = originalLines.map(line => normalizeKoreanFinancialText(line).trim());
  const headerIndex = lines.findIndex(looksLikeKoreanBankTableHeader);
  if (headerIndex < 0) return null;
  const unsafe = { csv: null, sourceLines: [] };
  const headers = koreanBankTableHeader(lines[headerIndex]!);
  if (!headers) return unsafe;
  const signature = headers.map(koreanFinancialHeader).join("|");
  const currency = detectCurrencyEvidence(text);
  if (!currency.currency || currency.ambiguous || lines.slice(0, headerIndex).some(looksDated)) return unsafe;
  const rows: string[][] = [];
  const sourceLines: Array<{ text: string; lineNumber: number } | null> = [];
  const metadata = new Map<string, string>();
  const acceptMetadata = (label: string, value: string, inTable: boolean) => {
    const key = koreanFinancialHeader(label) ?? "money_unit";
    // This adapter handles one account identity. Differing page headers must
    // not silently assign an earlier page to the first account we happened to read.
    if (metadata.has(key) && metadata.get(key) !== value && !(key === "money_unit" && inTable)) return false;
    metadata.set(key, value);
    return true;
  };
  const add = (cells: string[], lineNumber?: number) => {
    rows.push(cells);
    sourceLines.push(lineNumber === undefined ? null : { text: originalLines[lineNumber - 1]!, lineNumber });
  };
  add(["통화", currency.currency]);
  for (const line of lines.slice(0, headerIndex)) {
    const meta = metadataLine(line);
    if (meta) {
      if (!acceptMetadata(meta[1]!, meta[2]!, false)) return unsafe;
      add([meta[1]!, meta[2]!]);
    }
  }
  add(headers);
  let dataRows = 0;
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (!line || /^[-=_\s]+$/.test(line) || /^(?:페이지\s*)?\d+\s*\/\s*\d+$/.test(line)) continue;
    const repeated = koreanBankTableHeader(line);
    if (repeated) {
      if (repeated.map(koreanFinancialHeader).join("|") !== signature || repeated.join("|") !== headers.join("|")) return unsafe;
      continue;
    }
    const meta = metadataLine(line);
    if (meta) {
      if (!acceptMetadata(meta[1]!, meta[2]!, true)) return unsafe;
      add([meta[1]!, meta[2]!]);
      continue;
    }
    if (/^(?:합계|총계|소계|기초잔액|기말잔액)(?:\s|[:：]|$)/.test(line)) continue;
    if (/^(?:조회기간|출력일시|출력일자|발급일자)\s*[:：]/.test(line)) continue;
    const cells = line.includes("\t") ? line.split(/\t/) : line.includes("|") ? line.split("|") : line.split(/ {2,}/);
    const trimmed = cells.map(cell => cell.trim());
    if (trimmed.length !== headers.length || !parseKoreanDate(trimmed[0] ?? "") || !trimmed[1]) return unsafe;
    add(trimmed, index + 1);
    dataRows += 1;
  }
  return dataRows ? { csv: rows.map(row => row.map(escapeCell).join(",")).join("\n"), sourceLines } : unsafe;
}
