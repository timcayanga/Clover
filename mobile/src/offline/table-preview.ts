/** Bounded display-only CSV/TSV tokenizer: no heuristic financial normalization. */
export function delimitedPreview(source: string) {
  if (source.includes("\ufffd") || source.includes("\0"))
    throw new Error(
      "This file encoding needs online processing. The original has been retained.",
    );
  let text = source.replace(/^\ufeff/, "");
  if (text.length > 200000)
    throw new Error(
      "This table is too large for local preview. Queue the original for online parsing.",
    );
  const directive = /^sep=([,;|\t])(?:\r\n|[\r\n])/i.exec(text);
  if (directive) text = text.slice(directive[0].length);
  const delimiters = [",", "\t", ";", "|"];
  const hasTransactionHeader = (cells: string[]) => {
    const names = cells.map(cell => cell.trim().replace(/^"(.*)"$/, "$1").toLowerCase());
    return names.some(name => ["date", "posted date", "transaction date"].includes(name)) &&
      names.some(name => ["amount", "debit", "credit"].includes(name)) &&
      names.some(name => ["description", "merchant", "payee", "name"].includes(name));
  };
  const headerLines = text.split(/\r\n|[\r\n]/, 12);
  const firstLine = headerLines[0] ?? "";
  const delimiter = directive?.[1] ?? delimiters.find(candidate =>
    headerLines.some(line => hasTransactionHeader(line.split(candidate)))) ??
    delimiters.sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  let header: string[] | undefined;
  let recordCount = 0;
  let dataCount = 0;
  let lineNumber = directive ? 2 : 1;
  let recordStart = lineNumber;
  const previewRows: string[] = [];
  function finishRecord(cells: string[]) {
    if (!cells.some(Boolean)) return;
    recordCount++;
    if (!header) {
      if (recordCount <= 12 && hasTransactionHeader(cells)) {
        if (new Set(cells.map(h => h.trim().toLowerCase())).size !== cells.length)
          throw new Error("This table needs online review because its columns are inconsistent.");
        header = cells;
      }
      return;
    }
    if (cells.length !== header.length)
      throw new Error("This table needs online review because its columns are inconsistent.");
    dataCount++;
    if (previewRows.length < 20) {
      const names = header;
      previewRows.push(`Source row ${recordStart}\n` + cells.map((value, j) => `${names[j]}: ${value}`).join("\n"));
    }
  }
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\r" || (c === "\n" && text[i - 1] !== "\r")) lineNumber++;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        closed = true;
      } else cell += c;
      continue;
    }
    if (c === '"') {
      if (cell || closed)
        throw new Error("Ambiguous quoted table; use online parsing.");
      quoted = true;
    } else if (c === delimiter) {
      row.push(cell);
      cell = "";
      closed = false;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      finishRecord(row);
      recordStart = lineNumber;
      row = [];
      cell = "";
      closed = false;
    } else {
      if (closed && c.trim())
        throw new Error("Ambiguous quoted table; use online parsing.");
      cell += c;
    }
  }
  if (quoted)
    throw new Error(
      "The table has an unfinished quoted field. Use online parsing.",
    );
  row.push(cell);
  finishRecord(row);
  if (!header)
    throw new Error("No unambiguous transaction table found. Queue the original for full parsing.");
  return `Local table preview · Needs review\nShowing ${previewRows.length} of ${dataCount} source rows. Dates, signs, direction and currency are shown exactly as supplied; no transactions are confirmed.\n\n` +
    previewRows.join("\n\n");
}
