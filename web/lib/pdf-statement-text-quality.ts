const dateStart = /^(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}[-/.]\d{1,2}|\d{1,2}[- /][a-z]{3,9}(?:[- /]\d{2,4})?|[a-z]{3,9} \d{1,2}(?:,? \d{4})?)(?=\s|$)/i;
const amount = /(?<![\p{L}\d])(?:[+−-]\s*)?\(?\s*\d+(?:[., ]\d{3})*[.,]\d{2}\s*\)?(?!\d)/gu;
const badGlyph = /[\uFFFD\uE000-\uF8FF]|\(cid:\d+\)/u;
const tableHeader = /(?=.*\b(?:date|tanggal|tarikh)\b)(?=.*\b(?:description|particulars|details|keterangan|uraian)\b)(?=.*\b(?:debit|credit|amount|balance|saldo|mutasi)\b)/i;
const normalize = (line: string) => line.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();

const readAmounts = (text: string) => [...text.matchAll(amount)].map(match =>
  match[0].replace(/\s/g, "").replace(/−/g, "-"));
const sameSequence = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

function readLedger(text: string) {
  const lines = text.normalize("NFKC").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const heading = lines.findIndex(line => tableHeader.test(line));
  const standaloneDates = lines.filter(line => dateStart.exec(line)?.[0] === line).map(normalize);
  const detachedAmounts = lines.filter(line => line.replace(amount, "").replace(/[\s|₱$€£]/g, "") === "")
    .flatMap(line => readAmounts(line));
  const brokenColumns = standaloneDates.length >= 2 && detachedAmounts.length >= 2;
  const rows = lines.slice(heading + 1).flatMap(line => {
    if (/^(?:page|halaman|página|seite)\s*[:#.]?\s*\d+\b/i.test(line)) return [];
    const date = dateStart.exec(line)?.[0];
    if (!date) return [];
    // Some statements print both a posting and a value date.
    let detail = line.slice(date.length).trim();
    const secondDate = dateStart.exec(detail)?.[0];
    if (secondDate) detail = detail.slice(secondDate.length).trim();
    const amounts = readAmounts(detail);
    const description = detail.slice(0, detail.search(amount) < 0 ? undefined : detail.search(amount));
    const complete = amounts.length > 0 && /\p{L}/u.test(description.replace(/\b(?:PHP|USD|IDR|SGD|MYR|HKD|EUR|GBP|JPY|AUD|CAD|VND)\b/gi, "")) && !badGlyph.test(line);
    return [{ date: normalize(date), amounts, complete, description: normalize(description), line: normalize(line) }];
  });
  const detachedDescriptions = lines.slice(heading + 1).filter(line =>
    /^\p{L}/u.test(line) && !dateStart.test(line) && !readAmounts(line).length).map(normalize);
  return { hasHeading: heading >= 0, brokenColumns, standaloneDates, detachedAmounts, detachedDescriptions, rows };
}

export function assessPdfStatementTextPage(text: string, hasLedgerHeader: boolean) {
  const ledger = readLedger(text);
  if (!(ledger.hasHeading || hasLedgerHeader)) return [];
  if (ledger.brokenColumns) return ["broken_columns"];
  // A lone undated continuation, cover, or date-only header is not evidence of a broken ledger.
  if (!ledger.rows.some(row => row.amounts.length) && !(ledger.hasHeading && ledger.rows.length >= 2)) return [];
  return [...new Set(ledger.rows.flatMap(row => row.complete ? [] :
    [badGlyph.test(row.line) || (row.amounts.length && !row.complete) ? "missing_description" : "incomplete_row"]))];
}

// Require affirmative ledger evidence on every page before taking a new
// shortcut. A page number or a text header over a scanned table is insufficient.
export function hasCompletePdfNativeLedger(pages: readonly string[]) {
  const ledgers = pages.map(readLedger);
  return ledgers.some(ledger => ledger.hasHeading) &&
    ledgers.reduce((count, ledger) => count + ledger.rows.length, 0) >= 2 &&
    ledgers.every(ledger => !ledger.brokenColumns && ledger.rows.length > 0 &&
      ledger.rows.every(row => row.complete));
}

const pageMarker = /^(?:page|halaman|página|seite)\s*[:#.]?\s*\d+(?:\s*(?:of|\/|dari|de|von)\s*\d+)?$/iu;

function isImageOnlyLedgerPage(text: string) {
  return text.split(/\r?\n/).every(line => !line.trim() || pageMarker.test(line.trim()));
}

export function planHybridPdfLedgerRecovery(pages: readonly string[]) {
  if (!pages.some(hasPdfStatementLedgerHeader)) return [];
  if (!pages.some(page => {
    const { rows, brokenColumns } = readLedger(page);
    return !brokenColumns && rows.length > 0 && rows.every(row => row.complete);
  })) return [];
  return pages.flatMap((text, index) => {
    const reasons = isImageOnlyLedgerPage(text) ? ["missing_text_layer"] : assessPdfStatementTextPage(text, true);
    return reasons.length ? [{ page: index + 1, reasons }] : [];
  });
}

export function hasPdfStatementLedgerHeader(text: string) {
  return text.split(/\r?\n/).some(line => tableHeader.test(line));
}

export function canReplacePdfStatementTextPage(native: string, rendered: string) {
  const before = readLedger(native);
  const after = readLedger(rendered);
  if (after.brokenColumns || !after.rows.length || after.rows.some(row => !row.complete)) return false;
  if (isImageOnlyLedgerPage(native)) {
    const lines = new Set(rendered.split(/\r?\n/).map(normalize));
    return native.split(/\r?\n/).every(line => !line.trim() || lines.has(normalize(line)));
  }
  if (before.hasHeading && !after.hasHeading) return false;
  if (before.brokenColumns) {
    const headerIndex = native.split(/\r?\n/).findIndex(line => tableHeader.test(line));
    const renderedLines = new Set(rendered.split(/\r?\n/).map(normalize));
    if (headerIndex < 0 || native.split(/\r?\n/).slice(0, headerIndex + 1)
      .map(normalize).some(line => line && !renderedLines.has(line))) return false;
    // Recover simple detached date and single-amount columns only when the
    // image establishes the same ordered dates and amounts on complete rows.
    return before.rows.length === before.standaloneDates.length &&
      after.rows.every(row => row.amounts.length === 1) &&
      sameSequence(before.standaloneDates, after.rows.map(row => row.date)) &&
      sameSequence(before.detachedAmounts, after.rows.flatMap(row => row.amounts)) &&
      sameSequence(before.detachedDescriptions, after.rows.map(row => row.description));
  }
  if (before.rows.length !== after.rows.length) return false;
  const nativeRows = new Set(before.rows.map(row => row.line));
  const renderedLines = new Set(rendered.split(/\r?\n/).map(normalize));
  if (native.split(/\r?\n/).map(normalize).some(line => line && !nativeRows.has(line) && !renderedLines.has(line))) return false;
  return before.rows.every((row, index) => {
    const candidate = after.rows[index];
    if (row.complete) return row.line === candidate.line;
    if (row.date !== candidate.date || (!badGlyph.test(row.description) && row.description &&
      row.description !== candidate.description)) return false;
    if (!row.amounts.length) return true;
    return row.amounts.length === candidate.amounts.length &&
      row.amounts.every((value, amountIndex) => value === candidate.amounts[amountIndex]);
  });
}
