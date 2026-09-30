import * as XLSX from "xlsx";
import { koreanFinancialHeader, koreanInvestmentHeader } from "@/lib/korean-financial-text";
import { hasIndonesianFinancialHeaders, indonesianFinancialHeader, indonesianInvestmentHeader } from "@/lib/indonesian-financial-text";

const MAX_WORKBOOK_SHEETS = 32;
const MAX_WORKSHEET_ROWS = 25_000;
const MAX_WORKSHEET_COLUMNS = 512;
export const SPREADSHEET_WORKSHEET_MARKER = "__CLOVER_WORKSHEET__";

const formatDate = (value: Date) => {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const cellValueToText = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return formatDate(value);
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return String(value);
};

const spreadsheetSerialDateToText = (value: number, date1904: boolean) => {
  const parsedDate = XLSX.SSF.parse_date_code(value, { date1904 });
  if (!parsedDate) return null;
  return [
    String(parsedDate.y).padStart(4, "0"),
    String(parsedDate.m).padStart(2, "0"),
    String(parsedDate.d).padStart(2, "0"),
  ].join("-");
};

const worksheetCellToText = (cell: XLSX.CellObject | undefined, forceSerialDate = false, date1904 = false, indonesianNumber = false) => {
  if (!cell) return "";
  if (
    cell.t === "n" &&
    typeof cell.v === "number" &&
    (forceSerialDate || Boolean(cell.z && XLSX.SSF.is_date(cell.z)))
  ) {
    const parsedDate = spreadsheetSerialDateToText(cell.v, date1904);
    if (parsedDate) return parsedDate;
  }
  // An identifier formatted as 0000000000000 must retain its leading zeros.
  if (cell.t === "n" && typeof cell.v === "number" && typeof cell.z === "string" && /^0+$/.test(cell.z)) {
    return XLSX.SSF.format(cell.z!, cell.v);
  }
  // Native Excel numbers are locale-neutral. Express them in the table's
  // notation before CSV serialization so 42.123 units cannot become 42,123 units.
  if (indonesianNumber && cell.t === "n" && typeof cell.v === "number") {
    return cell.v.toLocaleString("id-ID", { useGrouping: false, maximumFractionDigits: 20 });
  }
  return cellValueToText(cell.v).trim();
};

const escapeCsvCell = (value: string) =>
  /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

const dateHeaderKeys = new Set(["date", "posted_date", "snapshot_date", "valuation_date"]);
const workbookHeaderKey = (value: string) => {
  const indonesian = indonesianInvestmentHeader(value) ?? indonesianFinancialHeader(value);
  if (indonesian) return indonesian;
  const korean = koreanInvestmentHeader(value) ?? koreanFinancialHeader(value);
  if (korean) return korean;
  const header = value.trim().toLowerCase().replace(/[_-]/g, " ").replace(/\s+/g, " ");
  if (/^(?:date|posted date|transaction date|snapshot date|balance date|valuation date|as of|as of date)$/.test(header)) return "date";
  if (/^(?:description|merchant|amount|debit|credit|balance|account(?: name| number| type)?|currency|direction|type|category|investment|platform|market value|units\/ shares|quantity)$/.test(header)) return "field";
  return null;
};

const updateDateColumns = (cells: Array<XLSX.CellObject | undefined>, dateColumns: Set<number>, indonesianNumbers: Set<number>) => {
  if (cells.every(cell => !cellValueToText(cell?.v).trim())) {
    return;
  }
  // Independently scoped headers support stacked and side-by-side tables. A
  // later Quantity/Account Number header must stop an earlier Date conversion.
  let start = 0;
  while (start < cells.length) {
    while (start < cells.length && !cellValueToText(cells[start]?.v).trim()) start += 1;
    let end = start;
    while (end < cells.length && cellValueToText(cells[end]?.v).trim()) end += 1;
    const group = cells.slice(start, end);
    const keys = group.map(cell => workbookHeaderKey(cellValueToText(cell?.v)));
    const looksLikeHeader = group.every(cell => typeof cell?.v === "string" && !/^\s*[+-]?\d/.test(cell.v)) &&
      (keys.filter(Boolean).length >= 2 || (group.length >= 2 && keys.some(key => dateHeaderKeys.has(key ?? ""))));
    if (looksLikeHeader) {
      const indonesian = hasIndonesianFinancialHeaders(group.map(cell => cellValueToText(cell?.v)));
      for (let index = start; index < end; index += 1) {
        if (dateHeaderKeys.has(keys[index - start] ?? "")) dateColumns.add(index);
        else dateColumns.delete(index);
        const numberKey = keys[index - start] ?? "";
        if (indonesian && (["amount", "debit", "credit", "balance", "fee", "original_amount", "market_value", "quantity", "monthly_contribution"].includes(numberKey) ||
          /^(?:amount|debit|credit|balance|fee|quantity|market value)$/i.test(cellValueToText(cells[index]?.v)))) indonesianNumbers.add(index);
        else indonesianNumbers.delete(index);
      }
    }
    start = end + 1;
  }
};

/**
 * Converts workbook sheets to CSV-compatible text so spreadsheet files use
 * the same deterministic schema parser and audit trail as CSV imports.
 */
export const decodeSpreadsheetWorkbookBytes = async (bytes: Uint8Array) => {
  const workbook = XLSX.read(bytes, {
    type: "array",
    // Keep spreadsheet dates as serials. Converting to JavaScript Date here
    // makes a calendar date depend on the server timezone and can shift it by
    // one day before parsing.
    cellDates: false,
    cellFormula: true,
    cellNF: true,
    cellText: false,
  });
  if (workbook.SheetNames.length > MAX_WORKBOOK_SHEETS) {
    throw new Error(`Spreadsheet imports support up to ${MAX_WORKBOOK_SHEETS} worksheets per workbook.`);
  }

  const sheetRows: Array<{ sheetIndex: number; sheetName: string; rows: string[][] }> = [];
  const date1904 = Boolean(workbook.Workbook?.WBProps?.date1904);
  for (const [sheetIndex, sheetName] of workbook.SheetNames.entries()) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) continue;
    const reference = worksheet["!ref"];
    if (!reference) continue;
    const range = XLSX.utils.decode_range(reference);
    const rowCount = range.e.r - range.s.r + 1;
    const columnCount = range.e.c - range.s.c + 1;
    if (rowCount > MAX_WORKSHEET_ROWS || columnCount > MAX_WORKSHEET_COLUMNS) {
      throw new Error(
        `Worksheet "${sheetName}" is too large. Spreadsheet imports support up to ${MAX_WORKSHEET_ROWS.toLocaleString()} rows and ${MAX_WORKSHEET_COLUMNS} columns per sheet.`
      );
    }

    // ODS exports may drop the source date number format. Header semantics are
    // authoritative enough to decode numeric spreadsheet serials in date columns.
    const dateColumns = new Set<number>();
    const indonesianNumbers = new Set<number>();

    const normalizedRows: string[][] = [];
    for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
      const cells = Array.from({ length: columnCount }, (_, offset) =>
        worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: range.s.c + offset })] as XLSX.CellObject | undefined);
      updateDateColumns(cells, dateColumns, indonesianNumbers);
      const row = Array.from({ length: columnCount }, (_, offset) => {
        const address = XLSX.utils.encode_cell({ r: rowIndex, c: range.s.c + offset });
        const cell = worksheet[address];
        if (cell?.f && (cell.v === undefined || cell.v === null || cell.t === "e")) {
          throw new Error(`Worksheet "${sheetName}" has a formula without a usable saved result at ${address}. Recalculate and save it in Excel, or export values, then upload again.`);
        }
        return worksheetCellToText(cell, dateColumns.has(offset), date1904, indonesianNumbers.has(offset));
      });
      while (row.length > 0 && row[row.length - 1] === "") row.pop();
      if (row.some(Boolean)) normalizedRows.push(row);
    }
    if (normalizedRows.length > 0) sheetRows.push({ sheetIndex, sheetName, rows: normalizedRows });
  }

  if (sheetRows.length === 0) {
    throw new Error("The uploaded spreadsheet workbook does not contain any readable rows.");
  }

  return sheetRows
    .flatMap(({ sheetIndex, sheetName, rows }) => [
      [SPREADSHEET_WORKSHEET_MARKER, String(sheetIndex), sheetName],
      ...rows,
    ])
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\n");
};
