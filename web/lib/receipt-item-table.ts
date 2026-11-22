import { isReceiptCurrencyCode } from "./receipt-currency-evidence";

// A purchase table must agree with two independently printed totals before it
// can replace the general OCR parser's line items.
export function readReconciledItemTable(text: string) {
  return readQuantityTable(text) ?? readRegisterServiceTable(text);
}

export const receiptNameFirstPriceHeader = /^[ \t]*(?:item(?:[ \t]+description)?|description)[ \t]+(?:qty|quantity)[ \t]+(?:unit[ \t]+)?price[ \t]+(?:line[ \t]+total|total|amount)[ \t]*\r?$/im;

function readQuantityTable(text: string) {
  const lines = text.split(/\r?\n/).map(line => line.trim());
  const header = lines.findIndex(line => receiptNameFirstPriceHeader.test(line) || /\b(?:qty|quantity)\b.*\b(?:ite(?:m)?|description)\b/i.test(line));
  if (header < 0) return null;

  const subtotalIndex = lines.findIndex((line, i) => i > header && /^sub[ -]?total\b/i.test(line));
  if (subtotalIndex < 0) return null;

  const nameFirst = receiptNameFirstPriceHeader.test(lines[header]);
  const hasUnitPrice = nameFirst || /\bunit\s+price\b|\bprice\s+(?:amount|line total|total)\b/i.test(lines[header]);
  // Parse printed denominations only in monetary columns. Keep the
  // original OCR transcript and numbers embedded in product names intact.
  const denominations = new Set<string>();
  const symbols: Record<string, string> = { "₱": "PHP", "€": "EUR", "£": "GBP" };
  const trailingPrice = /(^|[\s:])(?:(PHP|EUR|GBP|USD|CAD|AUD|SGD|HKD|₱|€|£)\s*)?(\d+(?:,\d{3})*\.\d{2}|\d+(?:\.\d{3})*,\d{2})$/i;
  function takePrice(value: string) {
    const suffix = value.match(/(?<=\d)\s*([A-Z]{3}|₱|€|£)$/u);
    if (suffix) {
      const currency = symbols[suffix[1]] ?? suffix[1];
      if (!isReceiptCurrencyCode(currency)) return null;
      denominations.add(currency);
      value = value.slice(0, suffix.index);
    }
    const price = trailingPrice.exec(value);
    if (!price) return null;
    // An unfamiliar ISO prefix can also be an uppercase product word.
    // Decline the table when its currency cannot be separated safely.
    if (!price[2]) {
      const otherCode = value.match(/(?:^|[:\s])([A-Z]{3})\s*\d[\d,.]*[.,]\d{2}$/)?.[1];
      if (otherCode && isReceiptCurrencyCode(otherCode) &&
          !(suffix && /\d[.,]\d{2}\s+[A-Z]{3}$/.test(value.slice(0, price.index)))) return null;
    }
    const code = price[2] && (symbols[price[2]] ?? price[2].toUpperCase());
    if (code) denominations.add(code);
    const amount = price[3].at(-3) === "," ? price[3].replace(/\./g, "").replace(",", ".") : price[3].replace(/,/g, "");
    return { prefix: value.slice(0, price.index).trimEnd(), amount };
  }
  const items: {description: string; quantity: number; amount: string; unitPrice?: string}[] = [];
  let itemCents = 0;
  for (const line of lines.slice(header + 1, subtotalIndex)) {
    if (!items.length && /^(?:dine in|take out|vat items?|vat item\(s\))$/i.test(line)) continue;
    const column = takePrice(line);
    const unitColumn = column && hasUnitPrice ? takePrice(column.prefix) : null;
    const beforePrice = hasUnitPrice ? unitColumn?.prefix : column?.prefix;
    const row = nameFirst
      ? beforePrice?.match(/^(?<description>.+?)\s+(?<quantity>(?:[1-9]\d*|0)(?:[.,]\d{1,3})?)$/)
      : beforePrice?.match(/^(?<quantity>(?:[1-9]\d*|0)(?:[.,]\d{1,3})?)\s+(?<description>.+)$/);
    if (column && row?.groups) {
      const { description, quantity: printedQuantity } = row.groups;
      const quantity = Number(printedQuantity.replace(",", "."));
      if (quantity <= 0 || (!hasUnitPrice && !Number.isSafeInteger(quantity))) return null;
      const amount = column.amount;
      const cents = Math.round(Number(amount) * 100);
      if (!Number.isSafeInteger(cents) || cents <= 0) return null;
      if (hasUnitPrice) {
        if (!unitColumn) return null;
        // Weighed goods can have three quantity decimals. Compute the
        // extension in integers, then round once to the printed cent.
        const [whole, fraction = ""] = printedQuantity.split(/[.,]/);
        const scale = 10 ** fraction.length;
        const units = Number(whole + fraction);
        const extension = units * Math.round(Number(unitColumn.amount) * 100);
        if (!Number.isSafeInteger(units) || !Number.isSafeInteger(extension) || Math.round(extension / scale) !== cents) return null;
        items.push({ description, quantity, unitPrice: unitColumn.amount, amount });
      } else {
        items.push({ description, quantity, amount });
      }
      itemCents += cents;
    } else if (items.length && /^[\p{L}][\p{L} '&-]{1,45}$/u.test(line)) {
      items[items.length - 1].description += " " + line;
    } else if (line && !/^[-=\s]+$/.test(line)) {
      return null;
    }
  }

  const priceInCents = (line: string) => {
    const price = takePrice(line);
    return price ? Math.round(Number(price.amount) * 100) : NaN;
  };
  const subtotal = priceInCents(lines[subtotalIndex]);
  if (!items.length || itemCents !== subtotal) return null;

  const footer = lines.slice(subtotalIndex + 1);
  const serviceRows = footer.filter(line => /^service\s+ch\w+\b/i.test(line));
  if (serviceRows.length > 1) return null;
  const service = serviceRows.length ? priceInCents(serviceRows[0]) : 0;
  const countedTotals = footer.filter(line => /^\d+\s+item\(s\)\s+total amount\b/i.test(line));
  const countedTotal = countedTotals[0];
  for (const counted of countedTotals) {
    const printedCount = Number.parseInt(counted, 10);
    const units = items.reduce((sum, item) => sum + item.quantity, 0);
    if ((printedCount !== items.length && printedCount !== units) || priceInCents(counted) !== subtotal + service) return null;
  }
  if (footer.some(line => /^(?:total paid|amount paid)\b/i.test(line) && priceInCents(line) !== subtotal + service)) return null;
  const totals = footer.filter(line => /^(?:total (?:amount|due)|bill (?:amount|total)|amount due|grand total|total(?=\s*(?:[:\d₱€£]|[A-Z]{3}\s*\d)))\b/i.test(line)).map(line => {
    const amount = priceInCents(line);
    if (Number.isFinite(amount) || !countedTotal) return amount;
    const annotated = line.match(/^total amount\s*:?\s*(\d[\d,]*\.\d{2})\s+[A-Za-z]+$/i);
    const verified = priceInCents(countedTotal);
    return annotated && Math.round(Number(annotated[1].replace(/,/g, "")) * 100) === verified ? verified : NaN;
  });
  if (denominations.size > 1 || !totals.length || totals.some(total => total !== subtotal + service)) return null;

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

// Some registers call the purchase subtotal "Total Amount" and print
// the payable "Total Due" immediately after the service charge.
function readRegisterServiceTable(source: string) {
  if (!/^[ \t]*(?:service charge|s\. charge)\b/im.test(source)) return null;
  const lines = source.split(/\r?\n/).map(line => line.trim());
  const index = lines.findIndex(line => /^(?:sub[ -]?total|total amount)\b/i.test(line));
  if (index < 0) return null;
  const subtotalRow = /^(?:sub[ -]?total|total amount)\s*[:：]?\s*([\d,]+\.\d{2})$/i.exec(lines[index]);
  const feeRow = /^(?:service charge|s\. charge)(?:\s+(?:\(\d+(?:\.\d+)?%\)|\d+(?:\.\d+)?%))?\s*[:：]?\s*([\d,]+\.\d{2})$/i.exec(lines[index + 1] ?? "");
  const totalRow = /^(?:total due|amount due|total)\s*[:：]?\s*([\d,]+\.\d{2})$/i.exec(lines[index + 2] ?? "");
  if (!subtotalRow || !feeRow || !totalRow) return null;
  const cents = (amount: string) => /^\d+(?:,\d{3})*\.\d{2}$/.test(amount)
    ? Number(amount.replace(/[,.]/g, "")) : NaN;
  const [subtotal, fee, payable] = [subtotalRow, feeRow, totalRow].map(row => cents(row[1]));
  if (!Number.isSafeInteger(payable) || fee <= 0 || subtotal + fee !== payable) return null;
  const outside = [...lines.slice(0, index), ...lines.slice(index + 3)].join("\n");
  const countLine = /^(?:total no\.? of items[ \t]*[:：][ \t]*(\d+)|[-=]*[ \t]*(\d+)(?:\.0+)?[ \t]+item\(s\)[ \t]*[-=]*)[ \t]*\r?$/gim;
  const counts = [...outside.matchAll(countLine)];
  if (counts.length !== 1) return null;
  // Extra totals, adjustments and count lines can belong to a different settlement.
  if (/^\s*(?:grand total|bill (?:amount|total)|amount (?:due|paid|to pay)|balance due|discount|rounding|gratuity|tip|service charge|s\. charge|sub[ -]?total|total)\b/im.test(outside.replace(countLine, ""))) return null;
  const items = readSubtotalItems(source);
  if (!items || items.some(item => item.unitPrice == null || (item.quantity ?? 1) < 1 ||
    (item.quantity == null && Number(item.unitPrice) === 0))) return null;
  const units = items.reduce((sum, item) => sum + (item.quantity ?? 1), 0);
  if (Number(counts[0][1] ?? counts[0][2]) !== units ||
      items.reduce((sum, item) => sum + cents(item.amount), 0) !== subtotal) return null;
  // A lost quantity glyph is recoverable when a positive unit price equals
  // the line amount and those units also reconcile to the printed unit count.
  const countedItems = items.map(item => item.quantity == null && item.unitPrice != null &&
    cents(item.unitPrice) > 0 && cents(item.unitPrice) === cents(item.amount)
    ? { ...item, quantity: 1 } : item);
  return { items: countedItems, total: (payable / 100).toFixed(2), subtotal: (subtotal / 100).toFixed(2),
    serviceCharge: (fee / 100).toFixed(2) };
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
  const margins = rows.map(row => {
    if (!row?.prefix) return null;
    const left = row.block.box[0];
    const matches = blocks.filter(block => block.text.trim() === row.prefix && sameRow(row.block, block) &&
      left - block.box[2] >= (block.box[2] - block.box[0]) / 2 && left - block.box[2] <= 0.10);
    return matches.length === 1 ? matches[0].box : null;
  });
  return items.map((item, index) => {
    const row = rows[index], box = margins[index];
    // Vision sometimes joins a margin digit and the name in one box.
    // Two other priced rows must establish both column positions.
    if (!row && item.quantity === undefined) {
      const prefix = item.description.match(/^([1-9]\d*) (.+)$/u);
      if (!prefix) return item;
      const merged = blocks.filter(block => block.text === item.description &&
        blocks.some(price => price.box[0] > block.box[2] && sameRow(block, price) &&
          price.text.trim().replace(/,/g, "") === item.amount));
      if (merged.length !== 1) return item;
      const start = merged[0].box[0], end = merged[0].box[2];
      const supporting = margins.flatMap((margin, j) => {
        const reference = rows[j];
        if (!margin || !reference?.prefix) return [];
        const labelStart = reference.block.box[0], width = margin[2] - margin[0];
        return width > 0 && labelStart - margin[2] >= width && Math.abs(start - margin[0]) <= width * 0.6 &&
          end > labelStart + width ? [labelStart] : [];
      });
      if (supporting.length >= 2 && Math.max(...supporting) - Math.min(...supporting) <= 0.015) {
        return { ...item, description: prefix[2], quantity: Number(prefix[1]) };
      }
    }
    if (!row?.prefix || !box || item.quantity !== undefined) return item;
    const left = row.block.box[0];
    // A padded digit box can approach its product name. Require a separately
    // spaced digit in the same column before accepting the narrower gap.
    const anchored = left - box[2] >= box[2] - box[0] || margins.some((other, j) =>
      other && j !== index && rows[j]!.block.box[0] - other[2] >= other[2] - other[0] &&
      Math.abs(other[0] + other[2] - box[0] - box[2]) <= other[2] - other[0]);
    const aligned = rows.filter(other => other && other !== row && Math.abs(other.block.box[0] - left) <= 0.015);
    return anchored && aligned.length >= 2 ? { ...item, description: row.name, quantity: Number(row.prefix) } : item;
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
  // With one missing quantity, the printed total fixes its value. Keep
  // ambiguous multi-row gaps and conflicting count summaries unresolved.
  const singleGap = verifiedColumn && !hasLeadingQuantity && quantities.filter(match => !match).length === 1 &&
    lines.filter(line => /^total\s+(?:[oqa]ty|quantity)\b/i.test(line)).length === 1 &&
    ordered.every(item => Number(item.amount) > 0 && !/\b(?:void|return|refund|discount)\b/i.test(item.description)) &&
    quantities.every((match, index) => match || !/\d[.,]\d|\s[+-]?\d+[.°]?$/.test(ordered[index].description));
  const purchases = verifiedColumn ? ordered.map((item, index) => {
    const match = quantities[index];
    if (match) return { ...item, description: match[1], quantity: Number(match[2]) };
    return singleGap && item.quantity === undefined ? { ...item, quantity: 1 } : item;
  }) : ordered;
  return { items: readMarginQuantities(purchases, blocks), serviceCharge: (service / 100).toFixed(2), subtotal: (subtotal / 100).toFixed(2), total };
}

// With a missing merchant or date, require an independently reconciled purchase table
// before showing the editable amount. A second scan should still handle partial rows.
export function canPreviewLocalReceiptItems(text: string, draft: { total: string | null; merchantName: string | null; billDate: string | null }) {
  return draft.total !== null && hasPrintedItemizedTotal(text, draft.total, !draft.merchantName || !draft.billDate);
}

// Some registers print VAT-inclusive item prices, apply a percentage to
// the pre-tax base, then print VAT again at checkout. Both calculations and
// the separate paid amount must agree before we can skip a full-page reread.
function reconcilesDiscountedVatReceipt(text: string, total: string) {
  if (!/^price net of vat[ \t]*:/im.test(text)) return false;
  const lines = text.split(/\r?\n/).map(line => line.trim());
  const money = "(\\d+(?:,\\d{3})*\\.\\d{2})";
  const subtotalPattern = new RegExp("^sub[ -]?total:[ \\t]*" + money + "$", "i");
  const start = lines.findIndex(line => subtotalPattern.test(line));
  if (start < 0 || lines.filter(line => subtotalPattern.test(line)).length !== 1) return false;
  const amount = (offset: number, pattern: string) => {
    const match = new RegExp("^" + pattern + "[ \\t]*" + money + "$", "i").exec(lines[start + offset] ?? "");
    return match ? Number(match[1].replace(/[,.]/g, "")) : NaN;
  };
  const gross = amount(0, "sub[ -]?total:");
  const base = amount(1, "price net of vat:");
  const discount = lines[start + 2]?.match(/^(\d{1,2}(?:\.\d{1,2})?)%[ \t]+[\p{L}][\p{L} .'-]*:[ \t]*-(\d+(?:,\d{3})*\.\d{2})$/u);
  if (!discount) return false;
  const reduction = Number(discount[2].replace(/[,.]/g, ""));
  const scaledDiscount = base * Math.round(Number(discount[1]) * 100);
  const vat = amount(3, "vat:");
  const payable = Number(total.replace(".", ""));
  if (![gross, base, reduction, vat, payable].every(Number.isSafeInteger) ||
      base <= 0 || gross < base || reduction <= 0 || reduction >= base || vat <= 0 ||
      !Number.isSafeInteger(scaledDiscount) || Math.round(scaledDiscount / 10000) !== reduction || base - reduction + vat !== payable) return false;
  const taxableSales = lines.filter(line => /^(?:vatable|taxable) sales\b/i.test(line));
  if (taxableSales.some(line => {
    const match = /^(?:vatable|taxable) sales:[ \t]*(\d+(?:,\d{3})*\.\d{2})$/i.exec(line);
    return !match || Number(match[1].replace(/[,.]/g, "")) !== base - reduction;
  })) return false;
  const printed = lines[start + 4]?.match(/^total:[ \t]*(?:([A-Z]{3})[ \t]*)?(\d+(?:,\d{3})*\.\d{2})$/i);
  if (lines.some((line, i) => i !== start + 4 && /^(?:grand total|bill (?:amount|total)|amount due|total(?: amount| due)?)\s*:/i.test(line))) return false;
  const paid = lines.slice(start + 5).filter(line => /^total paid:/i.test(line));
  if (lines.slice(0, start).some(line => /^total paid:/i.test(line))) return false;
  if (!printed || (printed[1] && !isReceiptCurrencyCode(printed[1].toUpperCase())) ||
      printed[2].replace(/,/g, "") !== total || paid.length !== 1 ||
      paid[0].replace(/^total paid:/i, "").replace(/[, \t]/g, "").toUpperCase() !== ((printed[1] ?? "") + total).toUpperCase()) return false;
  const items = readSubtotalItems(text);
  return !!items?.length && items.reduce((sum, item) => sum + Math.round(Number(item.amount) * 100), 0) === gross;
}

// When the merchant is cropped, verify the charged table against two
// independent printed rates before returning it for review.
function reconcilesTaxAndService(text: string, table: { subtotal: string; serviceCharge: string }) {
  const lines = text.split(/\r?\n/).map(line => line.trim());
  const one = (label: RegExp, format: RegExp) => {
    const rows = lines.filter(line => label.test(line));
    return rows.length === 1 ? rows[0].match(format) : null;
  };
  const fee = one(/^(?:\d+(?:\.\d+)?%\s*)?service\s*ch/i, /^(\d{1,2})%\s*service\s*ch(?:arge|rge)\s*:\s*[\d,]+\.\d{2}$/i);
  const sales = one(/^vat(?:able)? sales\b/i, /^vat(?:able)? sales\s*:?\s*([\d,]+\.\d{2})$/i);
  const tax = one(/^\d+(?:\.\d+)?%\s*vat\b/i, /^(\d{1,2})%\s*vat\s*:?\s*([\d,]+\.\d{2})$/i);
  if (!fee || !sales || !tax || !Number(fee[1]) || !Number(tax[1])) return false;
  if (lines.some(line => /^(?:total|grand total|balance|discount|rounding|tip|gratuity|refund|amount paid|sub[ -]?total)\b/i.test(line))) return false;
  if (lines.some(line => /^(?:[vu]at[ -]exempt|zero[ -]rated) sales/i.test(line) && !/\s0\.00$/.test(line))) return false;
  if (lines.filter(line => /^(?:amo(?:unt)?|bill am(?:ount|a))\b/i.test(line)).length !== 1) return false;
  const cents = (value: string) => Number(value.replace(/[,.]/g, ""));
  const base = cents(sales[1]), vat = cents(tax[2]), subtotal = cents(table.subtotal);
  return [base, vat, subtotal].every(Number.isSafeInteger) && base > 0 && vat > 0 &&
    base + vat === subtotal && Math.round(base * Number(tax[1]) / 100) === vat &&
    Math.round(subtotal * Number(fee[1]) / 100) === cents(table.serviceCharge);
}

export function hasPrintedItemizedTotal(text: string, total: string, requirePurchaseTable = false) {
  const register = readRegisterServiceTable(text);
  if (register) return register.total === total;
  let paidConflict = false;
  const totals = text.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^\s*(?:grand total|bill (?:amount|total)|amount (?:due|to pay|paid)|total(?: due| amount| paid)?)\s*[:：]?\s*(?:[A-Z]{3}|[₱$€£¥])?\s*(\d[\d,]*\.\d{2})\s*(?:[A-Z]{3}|[₱$€£¥])?\s*$/i);
    if (!match) return [];
    const amount = match[1].replace(/,/g, "");
    if (/^\s*amount paid\b/i.test(line)) {
      if (amount !== total) paidConflict = true;
      return [];
    }
    return [amount];
  });
  if (paidConflict || totals.some(value => value !== total)) return false;
  if (reconcilesDiscountedVatReceipt(text, total)) return true;
  const quantityTable = readQuantityTable(text);
  if (quantityTable) return quantityTable.total === total;
  const charged = readChargedReceiptTable(text);
  if (requirePurchaseTable && charged?.total === total && reconcilesTaxAndService(text, charged)) return true;
  if (requirePurchaseTable && totals.length === 2 && totals.every(amount => amount === total)) {
    // Small digital receipts sometimes end directly with the total and the
    // paid amount. Require both rows, plus a complete purchase sum.
    const end = /^total amount[ \t]*[:：]?[ \t]*\d[\d,]*\.\d{2}[ \t]*\r?\n[ \t]*total paid[ \t]*[:：]?[ \t]*\d[\d,]*\.\d{2}\s*$/im.exec(text);
    if (end && !text.slice(end.index + end[0].length).trim() &&
        !/^(?:total|grand total|bill amount|amount due|due|balance|tax|vat|service charge|tip|discount|change|cash|refund|sub[ -]?total|gross amount)\b/im.test(text.slice(0, end.index)) &&
        readSubtotalItems(text)) return true;
  }
  if (requirePurchaseTable) {
    // A separate, legible subtotal plus a matching printed payable can
    // establish the purchase amount even if the name or date needs review.
    const gross = [...text.matchAll(/^(?:gross amount|sub[ -]?total)[ \t]*[:：]?[ \t]*(\d[\d,]*\.\d{2})[ \t]*\r?$/gim)];
    const payableLabels = text.match(/^(?:grand total|bill (?:amount|total)|amount (?:due|to pay)|total(?: due| amount| paid)?)(?![ \t]+(?:[oqa]ty|quantity)\b)\b/gim);
    if (totals.length !== 1 || payableLabels?.length !== 1 || gross.length !== 1 || gross[0][1].replace(/,/g, "") !== total ||
        /^(?:service charge|s\. charge|discount|tip|rounding|balance due|total no\.? of items|\d+ item\(s\))/im.test(text)) return false;
  }
  if (charged) return charged.total === total;
  if (!totals.length) return false;
  const items = readSubtotalItems(text);
  if (!items) return false;
  if (requirePurchaseTable) {
    const counts = [...text.matchAll(/^total[ \t]+(?:[oqa]ty|quantity)[ \t]*[:：]?[ \t]*(\d+)[ \t]*\r?$/gim)];
    if (counts.length > 1 || (counts.length && Number(counts[0][1]) !==
        items.reduce((units, item) => units + (item.quantity ?? 1), 0))) return false;
  }
  const itemCents = items.reduce((sum, item) => sum + Math.round(Number(item.amount) * 100), 0);
  return itemCents === Math.round(Number(total) * 100);
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
