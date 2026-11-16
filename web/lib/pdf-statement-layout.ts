type TextCell = { text: string; x: number; width: number; height: number };
export type PositionedPdfRow = { centerY: number; items: TextCell[] };
type Transaction = { row: number; cells: string[] };
export type PdfStatementContinuation = { page: number; line: number; continuationPage: number };
type LayoutPage = {
  lines: string[];
  header: string | undefined;
  columns: number[];
  account: string | undefined;
  pagination: RegExpMatchArray | null;
  first: Transaction | undefined;
  last: Transaction | undefined;
  leading: number[];
  leadingMoney?: Transaction;
  changed: boolean;
};

const dateHeader = /^(?:(?:posting|posted|transaction|entry|value) )?date$/i;
const descriptionHeader = /^(?:(?:transaction|payment) )?(?:description|details|particulars|narrative)$/i;
const amountHeader = /^(?:(?:transaction|signed|net) )?amount(?: \([A-Z]{3}\))?$/i;
const balanceHeader = /^(?:(?:running|statement|closing) )?balance(?: \([A-Z]{3}\))?$/i;
const controls = /^(?:page\b|account (?:no\.?|number)\b|statement\b|(?:opening|beginning|ending|closing) balance\b|(?:sub)?total\b|balance (?:brought|carried) forward\b|continued\b|notes?\b|for (?:your|more)\b|please\b)/i;
const dateCell = /^(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}(?:[-/.]\d{2,4})?|\d{1,2}[- ][A-Za-z]{3}(?:[- ]\d{2,4})?|[A-Za-z]{3} \d{1,2}(?:,? \d{4})?)$/;
const moneyCell = /^(?:[+\-−] ?)?(?:[A-Z]{3} |[₱$£€])?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}[+\-−]?$/;
const headerKey = (item: TextCell) => item.text.replace(/\s+/g, " ").trim();

function cellsForRow(row: PositionedPdfRow, columns: number[]) {
  const cells = columns.map(() => [] as string[]);
  for (const item of row.items.slice().sort((left, right) => left.x - right.x)) {
    // Financial columns may be right aligned. Use the gap between headers as
    // the boundary, and reject text that visibly overlaps the next column.
    let index = columns.length - 1;
    while (index >= 0 && item.x < columns[index] - (index < 2 ? 4 : 14)) index--;
    if (index < 0 || (columns[index + 1] !== undefined && item.x + item.width > columns[index + 1] - 4)) return null;
    cells[index].push(item.text);
  }
  return cells.map(parts => parts.join(" "));
}

function readPage(rows: PositionedPdfRow[], lines: string[]): LayoutPage {
  const accountLabels = new Set(lines.filter(line => /^account\s*(?:number|no\.?|#)\s*[:#.]?\s*[\d*•Xx-]*\d{4}[\d*•Xx-]*\s*$/i.test(line)));
  const page: LayoutPage = {
    lines: [...lines], header: undefined, columns: [], first: undefined, last: undefined, leading: [], changed: false,
    account: accountLabels.size === 1 ? [...accountLabels][0] : undefined,
    pagination: lines.join("\n").match(/^\s*page\s+(\d+)\s*(?:of|\/)\s*(\d+)\s*$/im),
  };
  let priorIndex = -1;
  let mayContinueAcrossPage = false;
  let candidateLeading: number[] = [];

  for (const [index, row] of rows.entries()) {
    const sorted = row.items.slice().sort((left, right) => left.x - right.x);
    const labels = sorted.map(headerKey);
    if ((labels.length === 3 || (labels.length === 4 && balanceHeader.test(labels[3]))) &&
        dateHeader.test(labels[0]) && descriptionHeader.test(labels[1]) && amountHeader.test(labels[2]) &&
        sorted.every((cell, col) => col === 0 || cell.x - sorted[col - 1].x >= 32)) {
      const signature = labels.join("|").toLowerCase();
      if (page.header && (page.header !== signature || sorted.some((cell, col) => Math.abs(cell.x - page.columns[col]) > 4))) {
        page.account = undefined;
      }
      page.header ??= signature;
      page.columns = sorted.map(cell => cell.x);
      mayContinueAcrossPage = priorIndex < 0;
      if (!mayContinueAcrossPage && !page.first) candidateLeading = [];
      page.last = undefined;
      priorIndex = index;
      continue;
    }
    if (!page.columns.length) continue;
    const line = lines[index];
    if (/^\s*page\s+\d+\s*(?:of|\/)\s*\d+\s*$/i.test(line)) break;
    const cells = controls.test(line) ? null : cellsForRow(row, page.columns);
    const transaction = cells && dateCell.test(cells[0]) && moneyCell.test(cells[2]) &&
      (cells.length === 3 || moneyCell.test(cells[3]));
    const datedFragment = cells && dateCell.test(cells[0]) && Boolean(cells[1]) && cells.slice(2).every(value => !value);
    const moneyFragment = cells && !cells[0] && moneyCell.test(cells[2]) &&
      (cells.length === 3 || moneyCell.test(cells[3]));
    const continuation = cells && !cells[0] && Boolean(cells[1]) && /\p{L}/u.test(cells[1]) &&
      !dateCell.test(cells[1]) && !/\d[.,]\d{2}\s*(?:[+−-]|CR|DR)?\s*$/i.test(cells[1]) && cells.slice(2).every(value => !value);
    const adjacent = priorIndex >= 0 && index === priorIndex + 1 &&
      rows[priorIndex].centerY - row.centerY <= Math.min(24, Math.max(16, ...sorted.map(cell => cell.height * 1.75)));
    if (transaction && cells) {
      const entry = { row: index, cells };
      if (!page.first && !page.leadingMoney) page.leading = candidateLeading;
      page.first ??= entry;
      page.last = entry;
      mayContinueAcrossPage = false;
    } else if (datedFragment && cells) {
      page.last = { row: index, cells };
      mayContinueAcrossPage = false;
    } else if (moneyFragment && cells && adjacent && mayContinueAcrossPage && !page.leadingMoney) {
      page.leadingMoney = { row: index, cells };
      page.leading = candidateLeading;
      mayContinueAcrossPage = false;
    } else if (continuation && adjacent && page.last) {
      attach(page, page.last, cells[1]);
      page.lines[index] = "";
    } else if (continuation && adjacent && mayContinueAcrossPage) {
      candidateLeading.push(index);
    } else {
      page.last = undefined;
      mayContinueAcrossPage = false;
      if (!page.first) candidateLeading = [];
    }
    priorIndex = index;
  }
  return page;
}

function attach(page: LayoutPage, transaction: Transaction, continuation: string) {
  transaction.cells[1] = [transaction.cells[1], continuation].filter(Boolean).join(" ");
  page.lines[transaction.row] = transaction.cells.join(" ");
  page.changed = true;
}

export function reconstructPdfStatementPages(
  pages: Array<{ rows: PositionedPdfRow[]; lines: string[] } | null>,
  continuations: PdfStatementContinuation[] = [],
) {
  const layouts = pages.map(page => page && readPage(page.rows, page.lines));
  for (const [index, page] of layouts.entries()) {
    const previous = layouts[index - 1];
    if (!page || (!page.leading.length && !page.leadingMoney) || !previous?.last || !page.account || page.account !== previous.account ||
        page.header !== previous.header || page.columns.some((x, col) => Math.abs(x - previous.columns[col]) > 4) ||
        !page.pagination || !previous.pagination || page.pagination[2] !== previous.pagination[2] ||
        Number(page.pagination[1]) !== Number(previous.pagination[1]) + 1) continue;
    const pending = !previous.last.cells[2];
    if (pending !== Boolean(page.leadingMoney)) continue;
    if (page.leadingMoney) {
      const fragment = page.leadingMoney;
      previous.last.cells.splice(2, previous.last.cells.length - 2, ...fragment.cells.slice(2));
      page.lines[fragment.row] = "";
    }
    for (const rowIndex of page.leading) {
      attach(previous, previous.last, page.lines[rowIndex]);
      page.lines[rowIndex] = "";
    }
    if (page.leadingMoney) attach(previous, previous.last, page.leadingMoney.cells[1]);
    page.changed = true;
    continuations.push({
      page: index,
      line: previous.lines.slice(0, previous.last.row + 1).filter(Boolean).length,
      continuationPage: index + 1,
    });
  }
  return layouts.map(page => page?.changed ? page.lines.filter(Boolean).join("\n") : null);
}
