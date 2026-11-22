// A purchase table must agree with two independently printed totals before it
// can replace the general OCR parser's line items.
export function readReconciledItemTable(text: string) {
  const lines = text.split(/\r?\n/).map(line => line.trim());
  const header = lines.findIndex(line => /\b(?:qty|quantity)\b.*\b(?:ite(?:m)?|description)\b/i.test(line));
  if (header < 0) return null;

  const subtotalIndex = lines.findIndex((line, i) => i > header && /^sub[ -]?total\b/i.test(line));
  if (subtotalIndex < 0) return null;

  const items: {description: string; quantity: number; amount: string}[] = [];
  let itemCents = 0;
  for (const line of lines.slice(header + 1, subtotalIndex)) {
    const row = line.match(/^([1-9]\d*)\s+(.+?)\s+(\d+(?:,\d{3})*\.\d{2})$/);
    if (row) {
      const quantity = Number(row[1]);
      if (!Number.isSafeInteger(quantity)) return null;
      const amount = row[3].replace(/,/g, "");
      const cents = Math.round(Number(amount) * 100);
      if (!Number.isSafeInteger(cents) || cents <= 0) return null;
      items.push({description: row[2], quantity, amount});
      itemCents += cents;
    } else if (items.length && /^[\p{L}][\p{L} '&-]{1,45}$/u.test(line)) {
      items[items.length - 1].description += " " + line;
    } else if (line && !/^[-=\s]+$/.test(line)) {
      return null;
    }
  }

  const priceInCents = (line: string) => {
    const match = line.match(/(?:^|[:\s])(\d+(?:,\d{3})*\.\d{2})$/);
    return match ? Math.round(Number(match[1].replace(/,/g, "")) * 100) : NaN;
  };
  const subtotal = priceInCents(lines[subtotalIndex]);
  if (!items.length || itemCents !== subtotal) return null;

  const footer = lines.slice(subtotalIndex + 1);
  const serviceRows = footer.filter(line => /^service\s+ch\w+\b/i.test(line));
  if (serviceRows.length > 1) return null;
  const service = serviceRows.length ? priceInCents(serviceRows[0]) : 0;
  const totals = footer.filter(line => /^(?:total amount|grand total|total(?=\s*[:\d]))\b/i.test(line)).map(priceInCents);
  if (!totals.length || totals.some(total => total !== subtotal + service)) return null;

  return {
    items,
    subtotal: (subtotal / 100).toFixed(2),
    serviceCharge: serviceRows.length ? (service / 100).toFixed(2) : null,
    total: (totals[0] / 100).toFixed(2),
  };
}
