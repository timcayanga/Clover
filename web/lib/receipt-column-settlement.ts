/** Recover a POS OCR layout that reads the label column before the amount
 * column. Every monetary token is printed; redundant arithmetic establishes
 * alignment. Unrecognized/ambiguous layouts remain untouched for review. */
export function joinReceiptColumnSettlement(source: string): string {
  const lines = source.split(/\r?\n/);
  const nonempty = lines.map((line, index) => ({ text: line.trim(), index })).filter(line => line.text);
  const headings = [/^sub\s*total\s*:?$/i, /^total\s*:?$/i, /^tendered\s*:?$/i, /^cash\s*:?$/i, /^change\s*:?$/i];
  const starts = nonempty.flatMap((line, index) => headings[0].test(line.text) ? [index] : []);
  if (starts.length !== 1) return source;
  const start = starts[0];
  if (!headings.every((heading, offset) => heading.test(nonempty[start + offset]?.text ?? ''))) return source;
  if (headings.some(heading => nonempty.filter(line => heading.test(line.text)).length !== 1)) return source;
  let cursor = start + headings.length;
  const taxLabel = /^(?:VATable\s+Sales\s*\(V\)|VAT\s+Amount|VAT\s+Exempt|Sales\s*\([EZ]\)|Zero-Rated)$/i;
  const headerEnd = cursor;
  while (cursor - headerEnd < 12 && taxLabel.test(nonempty[cursor]?.text ?? '')) cursor++;
  if (cursor === headerEnd) return source;
  const amountToken = '(?:\\d{1,3}(?:,\\d{3})+|\\d+)\\.\\d{2}';
  const itemPattern = new RegExp(`^(${amountToken})\\s+[VEZ]$`, 'i');
  const moneyPattern = new RegExp(`^${amountToken}$`);
  const cents = (token: string) => Number(token.replace(/[,.]/g, ''));
  let itemSum = 0, itemCount = 0;
  while (itemCount < 50) {
    const match = nonempty[cursor]?.text.match(itemPattern);
    if (!match) break;
    const amount = cents(match[1]);
    if (!Number.isSafeInteger(amount) || amount <= 0) return source;
    itemSum += amount; itemCount++; cursor++;
  }
  if (!itemCount || !Number.isSafeInteger(itemSum)) return source;
  const cells = nonempty.slice(cursor, cursor + 4);
  if (cells.length !== 4 || cells.some(cell => !moneyPattern.test(cell.text))) return source;
  const [subtotal, total, cash, change] = cells.map(cell => cents(cell.text));
  if (![subtotal,total,cash,change].every(Number.isSafeInteger) || total <= 0 ||
      subtotal !== total || itemSum !== total || cash - change !== total || change < 0) return source;
  const result = [...lines];
  for (const [offset, amount] of [[0,cells[0].text],[1,cells[1].text],[3,cells[2].text],[4,cells[3].text]] as const) {
    const index = nonempty[start + offset].index;
    result[index] = `${lines[index].trim()} ${amount}`;
  }
  return result.join('\n');
}
