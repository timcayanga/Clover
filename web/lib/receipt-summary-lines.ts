import { joinReceiptColumnSettlement } from "./receipt-column-settlement";

/** Rejoin adjacent printed settlement cells without changing numeric tokens.
 * No item counts, invoice references, dates or arbitrary intervening text. */
export function joinReceiptSettlementLines(source: string): string {
  const lines = joinReceiptColumnSettlement(source).split(/\r?\n/);
  const output: string[] = [];
  const label = /^(?:grand\s+total|bill\s+(?:total|amount)|amount\s+due|total(?:\s+(?:amount|paid|due))?)\s*[:.]?\s*$/i;
  const money = /^(?:(?:PHP|USD|EUR|GBP|SGD|AUD|CAD|MYR|IDR|Rp\.?|₱|P|\$|€|£)\s*)?\d[\d,]*\.\d{2}(?:\s*(?:PHP|USD|EUR|GBP|SGD|AUD|CAD|MYR|IDR))?\s*$/i;
  for (let index = 0; index < lines.length; index++) {
    const current = lines[index].trim();
    let next = index + 1;
    if (/^total\s*[:.]?$/i.test(current) && /^amount\s*[:.]?$/i.test(lines[next]?.trim() ?? '')) next++;
    if (label.test(current) && money.test(lines[next]?.trim() ?? '')) {
      output.push(lines.slice(index, next + 1).map(line => line.trim()).join(' '));
      index = next;
    } else output.push(lines[index]);
  }
  return output.join('\n');
}
