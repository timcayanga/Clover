import * as XLSX from "xlsx";

const MAX_WORKBOOK_SHEETS = 32;
const MAX_WORKSHEET_ROWS = 25_000;
const MAX_WORKSHEET_COLUMNS = 512;

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

const spreadsheetSerialDateToText = (value: number) => {
  const parsedDate = XLSX.SSF.parse_date_code(value);
  if (!parsedDate) return null;
  return [
    String(parsedDate.y).padStart(4, "0"),
    String(parsedDate.m).padStart(2, "0"),
    String(parsedDate.d).padStart(2, "0"),
  ].join("-");
};

const worksheetCellToText = (cell: XLSX.CellObject | undefined, forceSerialDate = false) => {
  if (!cell) return "";
  if (
    cell.t === "n" &&
    typeof cell.v === "number" &&
    (forceSerialDate || Boolean(cell.z && XLSX.SSF.is_date(cell.z)))
  ) {
    const parsedDate = spreadsheetSerialDateToText(cell.v);
    if (parsedDate) return parsedDate;
  }
  return cellValueToText(cell.v).trim();
};

const escapeCsvCell = (value: string) =>
  /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

/**
 * Converts workbook sheets to CSV-compatible text so spreadsheet files use
 * the same deterministic schema parser and audit trail as CSV imports.
 */
export const decodeSpreadsheetWorkbookBytes = async (bytes: Uint8Array) => {
  const workbook = XLSX.read(bytes, {
    type: "array",
    cellDates: true,
    cellFormula: true,
    cellNF: true,
    cellText: false,
  });
  if (workbook.SheetNames.length > MAX_WORKBOOK_SHEETS) {
    throw new Error(`Spreadsheet imports support up to ${MAX_WORKBOOK_SHEETS} worksheets per workbook.`);
  }

  const sheetRows: string[][][] = [];
  for (const sheetName of workbook.SheetNames) {
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
    for (let rowIndex = range.s.r; rowIndex <= Math.min(range.e.r, range.s.r + 11); rowIndex += 1) {
      for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex += 1) {
        const header = cellValueToText(worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })]?.v)
          .trim()
          .toLowerCase();
        if (/^(?:date|posted date|transaction date|snapshot date|balance date|as of|as-of date)$/.test(header)) {
          dateColumns.add(columnIndex);
        }
      }
    }

    const normalizedRows: string[][] = [];
    for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
      const row = Array.from({ length: columnCount }, (_, offset) =>
        worksheetCellToText(
          worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: range.s.c + offset })],
          dateColumns.has(range.s.c + offset) && rowIndex > range.s.r
        )
      );
      while (row.length > 0 && row[row.length - 1] === "") row.pop();
      if (row.some(Boolean)) normalizedRows.push(row);
    }
    if (normalizedRows.length > 0) sheetRows.push(normalizedRows);
  }

  if (sheetRows.length === 0) {
    throw new Error("The uploaded spreadsheet workbook does not contain any readable rows.");
  }

  return sheetRows
    .flatMap((rows, index) => (index === 0 ? rows : [[], ...rows]))
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\n");
};
