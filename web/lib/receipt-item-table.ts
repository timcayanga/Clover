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
    if (!items.length && /^(?:dine in|take out|vat items?|vat item\(s\))$/i.test(line)) continue;
    const row = line.match(/^([1-9]\d*(?:\.0{1,2})?)\s+(.+?)\s+(\d+(?:,\d{3})*\.\d{2})$/);
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
  const countedTotal = footer.find(line => /^\d+\s+item\(s\)\s+total amount\s*:?\s*\d[\d,]*\.\d{2}$/i.test(line));
  if (countedTotal && priceInCents(countedTotal) !== subtotal + service) return null;
  const totals = footer.filter(line => /^(?:total amount|amount due|grand total|total(?=\s*[:\d]))\b/i.test(line)).map(line => {
    const amount = priceInCents(line);
    if (Number.isFinite(amount) || !countedTotal) return amount;
    const annotated = line.match(/^total amount\s*:?\s*(\d[\d,]*\.\d{2})\s+[A-Za-z]+$/i);
    const verified = priceInCents(countedTotal);
    return annotated && Math.round(Number(annotated[1].replace(/,/g, "")) * 100) === verified ? verified : NaN;
  });
  if (!totals.length || totals.some(total => total !== subtotal + service)) return null;

  return {
    items,
    subtotal: (subtotal / 100).toFixed(2),
    serviceCharge: serviceRows.length ? (service / 100).toFixed(2) : null,
    total: (totals[0] / 100).toFixed(2),
  };
}

// Some tills put the name on one line and quantity @ unit price on the next.
// Trust this reconstruction only when the entire contiguous run adds up to the
// independently printed subtotal. Retain the original transcript separately.
export function readSubtotalItems(source: string, allowQuantityRows = false) {
  const lines = source.normalize("NFKC").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const stop = lines.findIndex(line => /^(?:sub[ -]?total|gross amount|total amount)\s*[:：]?\s*\d[\d,]*\.\d{2}$/i.test(line));
  if (stop < 2) return null;
  const cents = (amount: string) => Math.round(Number(amount.replace(/,/g, "")) * 100);
  const expected = cents(lines[stop].match(/\d[\d,]*\.\d{2}$/)![0]);
  if (!Number.isSafeInteger(expected) || expected <= 0) return null;
  type Item = { description: string; amount: string; quantity?: number; unitPrice?: string };
  const items: Item[] = [];
  let sum = 0;
  let suffix = "";
  const hasQuantityHeader = lines.slice(0, stop).some(line => /^(?:qty|quantity)\b/i.test(line));
  const excluded = /^(?:sub[ -]?total|total|service charge|cash|vat|tax|discount|amount due|bill amount|table|server|cashier|guest|order type|ref\b|tin\b|register|dine in|walk-in|gross amount|net amount)\b/i;
  const name = (value: string) => /\p{L}/u.test(value) && !excluded.test(value) && !/[:：@]/.test(value);
  for (let i = stop - 1; i >= 0; i--) {
    const line = lines[i];
    if (/^[-= ]*\d+(?:\.0+)?\s+item\(s\)[-= ]*$/i.test(line) || /^total\s+[oq]ty\s+\d+$/i.test(line)) continue;
    // A fractional quantity at the left belongs to the ordinary column parser.
    if (/^\d+\.\d+\s+\p{L}/u.test(line)) break;
    // A damaged separator can be discarded only when the neighboring unit
    // price supplies the same digits and the result reconciles to the subtotal.
    const repeated = line.match(/^[@(©]\s*(\d+\.\d{2})\s+(\d+(?:\.\d+){2})$/);
    if (repeated && i > 0 && name(lines[i - 1]) &&
        repeated[1].replace(/\./g, "") === repeated[2].replace(/\./g, "")) {
      items.push({ description: lines[--i], amount: repeated[1], unitPrice: repeated[1] });
      sum += cents(repeated[1]);
      continue;
    }
    const priced = line.match(/^(.+?)\s+(\d[\d,]*\.\d{2})(?:\s+[A-Z0-9])?$/);
    if (!priced) {
      if (/^[a-z]$/.test(line)) continue;
      if (!name(line) || /\d/.test(line) || (suffix && suffix.length + line.length > 80)) break;
      suffix = suffix ? line + " " + suffix : line;
      continue;
    }
    const amount = priced[2].replace(/,/g, "");
    const prefix = priced[1].trim();
    const columns = prefix.match(/^(.+?)\s+(\d+(?:\.0+)?)\s+(\d[\d,]*\.\d{2})$/);
    if (columns && name(columns[1]) && Number(columns[2]) * cents(columns[3]) === cents(amount)) {
      items.push({ description: suffix ? columns[1] + " " + suffix : columns[1], quantity: Number(columns[2]),
        unitPrice: columns[3].replace(/,/g, ""), amount });
      suffix = "";
      sum += cents(amount);
      continue;
    }
    const unit = prefix.match(/^(?:(\d+(?:\.0+)?)|\(0\))\s*[(©€@ ]*\s*(\d[\d,]*\.\d{2})$/);
    let item: Item;
    if (unit) {
      if (suffix || i === 0 || !name(lines[i - 1])) break;
      const quantity = unit[1] ? Number(unit[1]) : undefined;
      if (quantity !== undefined && (!Number.isSafeInteger(quantity) || quantity < 1)) break;
      if ((quantity ?? 1) * cents(unit[2]) !== cents(amount)) break;
      item = { description: lines[--i], quantity, unitPrice: unit[2].replace(/,/g, ""), amount };
    } else {
      if ((!allowQuantityRows && /^\d+(?:\.0+)?\s+\p{L}/u.test(prefix)) || !name(prefix) || /^\d+\s+[@(©€]/.test(prefix) || /\d[,.]\d{2}$/.test(prefix)) break;
      const leadingQuantity = hasQuantityHeader ? prefix.match(/^([1-9]\d*)\s+(\p{L}.*)$/u) : null;
      if (leadingQuantity && !name(leadingQuantity[2])) break;
      const description = leadingQuantity?.[2] ?? prefix;
      item = { description: suffix ? description + " " + suffix : description, amount,
        ...(leadingQuantity ? { quantity: Number(leadingQuantity[1]) } : {}) };
    }
    suffix = "";
    items.push(item);
    sum += cents(amount);
    if (sum > expected) return null;
  }
  return items.length >= 2 && sum === expected ? items.reverse() : null;
}

type OpticalBlock = import("../../shared/device-text-evidence").OpticalTextLine;
type PricedItem = { description: string; amount: string; quantity?: number };

// A leading number can be part of a product name. Only separate it when its
// own box is in the margin of a price-verified, aligned description column.
function readMarginQuantities(items: PricedItem[], blocks: OpticalBlock[]) {
  if (!blocks.length || !items.some(item => /^\d+ /.test(item.description))) return items;
  const sameRow = (a: OpticalBlock, b: OpticalBlock) =>
    Math.min(a.box[3], b.box[3]) - Math.max(a.box[1], b.box[1]) >
      Math.min(a.box[3] - a.box[1], b.box[3] - b.box[1]) * 0.5;
  const rows = items.map(item => {
    const prefix = item.description.match(/^([1-9]\d*) (.+)$/u);
    const name = prefix?.[2] ?? item.description;
    const names = blocks.filter(block => block.text.trim() === name &&
      blocks.some(price => price.box[0] > block.box[2] && sameRow(block, price) &&
        price.text.trim().replace(/,/g, "") === item.amount));
    return names.length === 1 ? { block: names[0], name, prefix: prefix?.[1] } : null;
  });
  return items.map((item, index) => {
    const row = rows[index];
    if (!row?.prefix || item.quantity !== undefined) return item;
    const left = row.block.box[0];
    const margin = blocks.filter(block => block.text.trim() === row.prefix && sameRow(row.block, block) &&
      left - block.box[2] >= block.box[2] - block.box[0] && left - block.box[2] <= 0.10);
    const aligned = rows.filter(other => other && other !== row && Math.abs(other.block.box[0] - left) <= 0.015);
    return margin.length === 1 && aligned.length >= 2 ? { ...item, description: row.name, quantity: Number(row.prefix) } : item;
  });
}

// A partly damaged payable label can still carry reliable digits. Require the
// purchase rows plus the separately printed service charge to prove every cent.
export function readChargedReceiptTable(source: string, blocks: OpticalBlock[] = []) {
  const lines = source.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const charge = lines.findIndex(line => /^(?:\d+(?:\.\d+)?%\s*)?service\s*ch(?:arge|rge)\s*:\s*\d[\d,]*\.\d{2}$/i.test(line) ||
    /^service\s+charge\s+\d[\d,]*\.\d{2}$/i.test(line));
  if (charge < 2) return null;
  const payable = lines[charge + 1]?.match(/^(?:bill\s+am(?:ount|a)|amo(?:unt)?(?: due)?)\s*[:：]?\s*(\d[\d,:=. ]*\d)$/i);
  if (!payable || !/[.,= ]\d{2}$/.test(payable[1])) return null;
  const money = (value: string) => Math.round(Number(value.replace(/,/g, "")) * 100);
  const service = money(lines[charge].match(/\d[\d,]*\.\d{2}$/)![0]);
  let end = charge;
  const printedGross = lines[end - 1].match(/^gross amount\s*[:：]?\s*(\d[\d,]*\.\d{2})$/i);
  if (/^gross amount\b/i.test(lines[end - 1])) end--;
  const count = end ? lines[end - 1].match(/^total\s+(?:qty|aty|quantity)\s+(\d+)$/i) : null;
  if (count) end--;
  const hasLeadingQuantity = lines.slice(0, end).some(line => /^(?:qty|quantity)\b/i.test(line));
  const items: { description: string; amount: string; quantity?: number }[] = [];
  let subtotal = 0;
  for (let i = end - 1; i >= 0; i--) {
    let line = lines[i];
    if (/^\d[\d,]*\.\d{2}$/.test(line) && i > 0 && /^[1-9]\d*\s+\p{L}/u.test(lines[i - 1])) {
      line = lines[--i] + " " + line;
    }
    const row = line.match(/^(?:([1-9]\d*)\s+)?(\p{L}.+?)\s+(\d[\d,]*\.\d{2})$/u);
    if (!row || /^(?:vat|total|tax|cash|discount|service|gross|table|change)\b/i.test(row[2])) break;
    subtotal += money(row[3]);
    const description = row[1] && !hasLeadingQuantity ? row[1] + " " + row[2] : row[2];
    items.push({ description, amount: row[3].replace(/,/g, ""),
      ...(row[1] && hasLeadingQuantity ? { quantity: Number(row[1]) } : {}) });
  }
  const calculated = subtotal + service;
  // Match complete digits, including both cents. Never manufacture a digit.
  if ((printedGross && money(printedGross[1]) !== subtotal) || items.length < 2 || !Number.isSafeInteger(calculated) || calculated <= 0 ||
      String(calculated) !== payable[1].replace(/[,:=. ]/g,"")) return null;
  const total = (calculated / 100).toFixed(2);
  if (lines.slice(charge + 2).some(line =>
    /^(?:grand total|total amount|amount due|bill amount)\b/i.test(line) &&
    line.match(/\d[\d,]*\.\d{2}$/)?.[0].replace(/,/g,"") !== total)) return null;
  const ordered = items.reverse();
  // Strip a trailing quantity column only if the printed quantity total
  // independently confirms it, including at least one unit per unread row.
  const quantities = ordered.map(item => item.description.match(/^(.+?)\s+([1-9]\d*)[.°]?$/));
  const counted = quantities.reduce((sum, match) => sum + (match ? Number(match[2]) : 1), 0);
  const verifiedColumn = count && counted === Number(count[1]) &&
    quantities.filter(Boolean).length >= Math.max(2, Math.ceil(ordered.length / 2));
  const purchases = verifiedColumn ? ordered.map((item, index) => {
    const match = quantities[index];
    return match ? { ...item, description: match[1], quantity: Number(match[2]) } : item;
  }) : ordered;
  return { items: readMarginQuantities(purchases, blocks), serviceCharge: (service / 100).toFixed(2), subtotal: (subtotal / 100).toFixed(2), total };
}

export function hasPrintedItemizedTotal(text: string, total: string) {
  const reconciled = readReconciledItemTable(text) ?? readChargedReceiptTable(text);
  if (reconciled) return reconciled.total === total;
  if (!readSubtotalItems(text)) return false;
  const totals = text.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^\s*(?:grand total|amount due|total(?: due| amount| paid)?)\s*[:：]?\s*(?:[A-Z]{3}|₱)?\s*(\d[\d,]*\.\d{2})\s*$/i);
    return match ? [match[1].replace(/,/g, "")] : [];
  });
  return totals.length > 0 && totals.every(value => value === total);
}

// Recover a separately printed quantity only when its box sits between the
// item's last word and its price, in a column shared by multiple item rows.
export function readOpticalItemQuantities<T extends { description: string; amount: string; quantity?: number }>(
  items: T[], text: string, blocks: import("../../shared/device-text-evidence").OpticalTextLine[],
) {
  const count = text.match(/^total\s+[oq]ty\s+(\d+)$/im);
  if (!count || !blocks.length) return items;
  const candidates = items.map(item => {
    const parts = item.description.match(/^(.+?)\s+([1-9]\d?)$/);
    if (!parts || item.quantity !== undefined) return null;
    const lastWord = parts[1].split(/\s+/).pop()!.toLowerCase();
    const matches = blocks.filter(block => block.text.trim() === parts[2]).filter(block => {
      const [left, top, right, bottom] = block.box;
      const sameRow = blocks.filter(other => Math.min(bottom, other.box[3]) - Math.max(top, other.box[1]) >
        Math.min(bottom - top, other.box[3] - other.box[1]) * 0.45);
      return sameRow.some(other => other.box[2] < left && other.text.trim().toLowerCase().split(/\s+/).pop() === lastWord) &&
        sameRow.some(other => other.box[0] > right && other.text.trim().replace(/,/g, "") === item.amount);
    });
    return matches.length === 1 ? { name: parts[1], qty: Number(parts[2]), x: matches[0].box[0] } : null;
  });
  const observed = candidates.filter(candidate => candidate !== null);
  const minimum = candidates.reduce((sum, candidate, i) => sum + (candidate?.qty ?? items[i].quantity ?? 1), 0);
  if (observed.length < 2 || Math.max(...observed.map(c => c.x)) - Math.min(...observed.map(c => c.x)) > 0.025 ||
      minimum > Number(count[1])) return items;
  return items.map((item, i) => {
    const candidate = candidates[i];
    return candidate ? { ...item, description: candidate.name, quantity: candidate.qty } : item;
  });
}

// When the item price column is illegible, an audit number or receipt number
// in the header must not supply prices for the unpriced description rows.
export function hasUnpricedItemBody(text: string) {
  const lines = text.split(/\r?\n/).map(line => line.trim());
  const end = lines.findIndex(line => /^sub[ -]?total\s*[:：]?$/i.test(line));
  if (end < 3) return false;
  const lastRows = lines.slice(end - 3, end);
  return lastRows.every(line => /^\p{L}[\p{L}\d '’/().,&-]+$/u.test(line)) &&
    !lines.slice(0, end).some(line => /(?:^|[^\d])\d+[.,]\d{2}\s*$/.test(line));
}

// A damaged price column can contain several item names followed by only one
// readable price. Do not assign that price to the concatenation of all names.
export function readPartialPriceColumn(text: string) {
  const lines = text.split(/\r?\n/).map(line => line.trim());
  const end = lines.findIndex(line => /^sub[ -]?total\s*[:：]?\s+\d[\d,]*\.\d{2}$/i.test(line));
  if (end < 4) return null;
  const items: { description: string; amount: string }[] = [];
  let unpriced = 0;
  let damagedPrice = false;
  for (let i = end - 1; i >= 0; i--) {
    const row = lines[i].match(/^(\p{L}[\p{L}\p{N} '&/().,-]*?)\s+(\d[\d,]*\.\d{1,2})$/u);
    if (row) {
      if (row[2].split(".")[1].length === 1) damagedPrice = true;
      else items.push({ description: row[1], amount: row[2].replace(/,/g, "") });
    } else if (/^\p{L}[\p{L} '&/().,-]+$/u.test(lines[i])) unpriced++;
    else break;
  }
  return damagedPrice && unpriced >= 2 && items.length >= 2 ? items.reverse() : null;
}
