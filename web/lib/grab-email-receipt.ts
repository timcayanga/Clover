import type { DetectedStatementMetadata, ParsedImportRow } from './import-parser';

const prefix = 'GRAB_RECEIPT_NATIVE ';
const amountPattern = '(\\d{1,3}(?:,\\d{3})*\\.\\d{2}|\\d+\\.\\d{2})';
const currencyPattern = '(?:PHP|₱|P)';
const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
type PickupField = { reference: string; merchant: string; page: number };
function fail(reason: string): never { throw new Error(`Grab receipt requires source review: ${reason}`); }
const cents = (text: string) => Math.round(Number(text.replaceAll(',', '')) * 100);

export function buildGrabReceiptNativePages(pages: string[], pickupFields?: PickupField[]): string | null {
  const text = pages.join('\n');
  if (!/Your\s+Grab\s+E-?Receipt/i.test(text) || !/Hope\s*you\s*(?:enjoyed|had an enjoyable)/i.test(text)) return null;
  // Preserve every physical page, including incomplete/unsupported receipts.
  // Validation happens before financial persistence, never by inventing fields.
  return prefix + JSON.stringify({ physicalPages: pages.length, pages: pages.map((text, index) => ({ page: index + 1, text })), ...(pickupFields ? { pickupFields } : {}) });
}

/** Keep restaurant names in their own native column, away from item options. */
export function buildGrabPickupFields(items: Array<{ str?: string; transform?: number[] }>, page: number): PickupField[] {
  const cells = items.map(i => ({ text: String(i.str ?? '').replace(/\s+/g, ' ').trim(), x: Number(i.transform?.[4]), y: Number(i.transform?.[5]) })).filter(i => i.text && Number.isFinite(i.x) && Number.isFinite(i.y));
  return cells.filter(c => /^Pick up location:$/i.test(c.text)).flatMap(label => {
    const summary = cells.find(c => /^Receipt Summary$/i.test(c.text) && c.x > label.x && c.y > label.y);
    const drop = cells.filter(c => /^Drop off location:$/i.test(c.text) && Math.abs(c.x - label.x) < 15 && c.y < label.y).sort((a, b) => b.y - a.y)[0];
    if (!summary || !drop) return [];
    const references = cells.filter(c => /^A-[A-Z0-9]{8,}$/.test(c.text) && c.x < summary.x && c.y > label.y);
    if (references.length !== 1) return [];
    const names = cells.filter(c => c.y < label.y - 2 && c.y > drop.y + 2 && c.x >= label.x - 15 && c.x < summary.x - 5).sort((a, b) => b.y - a.y || a.x - b.x);
    const merchant = names.map(c => c.text).join(' ');
    return merchant && merchant.length <= 160 ? [{ reference: references[0].text, merchant, page }] : [];
  });
}

function paymentDate(text: string): { date: string; sourceTimestamp: string | null; sourceClock: string | null } {
  const clocks = [...text.matchAll(/Pick-up time:\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{2}|\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?\s*\+0800/gi)];
  const dates = [...text.matchAll(/Picked up on\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/gi)];
  if (clocks.length + dates.length !== 1) fail('one explicit pickup date is required');
  const m = clocks[0] ?? dates[0];
  const year = Number(m[3]) + (m[3].length === 2 ? 2000 : 0);
  const month = months.indexOf(m[2].slice(0, 3).toLowerCase());
  const day = Number(m[1]);
  const d = new Date(Date.UTC(year, month, day, 12));
  if (month < 0 || d.getUTCFullYear() !== year || d.getUTCMonth() !== month || d.getUTCDate() !== day) fail('invalid calendar date');
  if (!clocks.length) return { date: d.toISOString(), sourceTimestamp: null, sourceClock: null };
  const hour = Number(m[4]), minute = Number(m[5]), second = Number(m[6] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) fail('invalid pickup clock');
  const sourceTimestamp = `${d.toISOString().slice(0, 10)}T${m[4]}:${m[5]}:${String(second).padStart(2, '0')}+08:00`;
  return { date: new Date(sourceTimestamp).toISOString(), sourceTimestamp, sourceClock: m[0] };
}

function oneReceipt(text: string, fullText: string, pickupFields?: PickupField[]): ParsedImportRow {
  const explicitPhp = /₱|\bPHP\b|Philippines|Metro Manila|Quezon City|Makati|Taguig|Caloocan/i.test(text);
  // Older Philippine email receipts print only "P" at the headline. Require a
  // matching peso headline and a Philippine trip location, not a generic P.
  const localPeso = /\bTotal Paid\s+P\s*\d[\d,]*\.\d{2}\b/i.test(text) && /\b(?:NAIA|Pasay|Manila|Cebu|Davao)\b/i.test(text);
  if (!explicitPhp && !localPeso) fail('Philippine currency evidence is missing');
  if (/(?:S\$|SGD|MYR|\bRM\b|THB|IDR|VND|₫|\bRp)\s*\d/i.test(text)) fail('unsupported or mixed source currency');
  const food = /Hope you enjoyed your food/i.test(text);
  const refs = [...new Set([...text.matchAll(/\b(?:A-[A-Z0-9]{8,}|ADR-?[A-Z0-9]+(?:-[A-Z0-9]+)+)\b/g)].map(m => m[0]))];
  if (!/Booking\s+(?:ID|code)/i.test(text)) fail('booking label is missing');
  if (refs.length !== 1) fail('one complete booking reference is required');
  const date = paymentDate(text);
  const totalLabels = food ? 'TOTAL\\s*\\(INCL\\.\\s*TAX\\)' : 'Total Paid|TOTAL';
  const totals = [...text.matchAll(new RegExp(`\\b(?:${totalLabels})\\s+(?:${currencyPattern}\\s*)?${amountPattern}\\b`, 'gi'))].map(m => cents(m[1]));
  // Older receipts put the headline amount below TOTAL / DATE | TIME.
  for (const m of text.matchAll(/\bTOTAL\s+DATE\s*\|\s*TIME/gi)) {
    const headline = text.slice(m.index! + m[0].length, m.index! + m[0].length + 180).match(new RegExp(`${currencyPattern}\\s*${amountPattern}\\b`, 'i'));
    if (!headline) fail('headline total is missing');
    totals.push(cents(headline[1]));
  }
  if (totals.length < 2 || new Set(totals).size !== 1 || totals[0] <= 0) fail('headline and summary totals must agree');
  const total = totals[0];
  const paymentRegion = text.match(/\bPaid by\b([\s\S]{0,600}?)(?=Got an issue\?|$)/i)?.[1] ?? '';
  const labeledMethod = text.match(/Payment Method:\s*(?:(?:GrabFood|GrabCar)\s+)?(GCash|Cash|GrabPay Wallet)\b/i)?.[1];
  const paidMethods = [...paymentRegion.matchAll(new RegExp(`\\b(Cash|GCash|GrabPay Wallet)\\s+${amountPattern}\\b`, 'gi'))];
  const legacyCash = paidMethods.length === 0 && /\bCash\b/i.test(paymentRegion) && !/\b(?:GCash|GrabPay Wallet)\b/i.test(paymentRegion);
  const method = labeledMethod ?? (paidMethods.length === 1 && cents(paidMethods[0][2]) === total ? paidMethods[0][1] : legacyCash ? 'Cash' : null);
  if (!method || /\b(?:MasterCard|Visa|Amex)\b/i.test(text)) fail('only explicit Cash, GCash or GrabPay Wallet payment is supported; card issuer/account remains unknown');
  const components: Array<{ label: string; amount: number }> = [];
  if (food) {
    const subtotal = [...text.matchAll(new RegExp(`\\bSubtotal\\s+${currencyPattern}\\s*${amountPattern}\\b`, 'gi'))];
    const delivery = [...text.matchAll(new RegExp(`\\bDelivery Fee\\s+${currencyPattern}\\s*${amountPattern}\\b`, 'gi'))];
    if (subtotal.length !== 1 || delivery.length !== 1 || /Priority Delivery|GrabVIP Benefit|GrabUnlimited|Promo|Promotion/i.test(text)) fail('food summary is incomplete or unsupported');
    components.push({ label: 'Subtotal', amount: cents(subtotal[0][1]) / 100 }, { label: 'Delivery Fee', amount: cents(delivery[0][1]) / 100 });
  } else {
    const fareText = text.replace(/DATE\s*\|\s*TIME/gi, 'Pickup clock heading');
    const matches = [...fareText.matchAll(new RegExp(`\\b(Base fare|Fare|Distance|Time|Surge charges|Toll|Promo|Promotion|Ride Cover opt-in)\\s+(-\\s*)?(?:${currencyPattern}\\s*)?${amountPattern}\\b`, 'gi'))];
    const keys = new Set<string>();
    for (const m of matches) {
      const key = m[1].toLowerCase();
      if (keys.has(key)) fail('duplicate fare component');
      keys.add(key);
      components.push({ label: m[1], amount: cents(m[3]) / 100 * (m[2] ? -1 : 1) });
    }
    if (!components.length) fail('fare breakdown is missing');
  }
  if (Math.round(components.reduce((n, c) => n + c.amount, 0) * 100) !== total) fail('fare/food components do not reconcile');
  const paid = text.match(new RegExp(`\\bCash\\s+${amountPattern}\\b`, 'i'));
  if (method.toLowerCase() === 'cash' && paid && cents(paid[1]) !== total) fail('cash payment disagrees with the receipt');
  const pickups = pickupFields?.filter(f => f.reference === refs[0]);
  if (food && pickups && pickups.length !== 1) fail('native restaurant column is missing or conflicting');
  const merchant = food ? pickups?.[0]?.merchant ?? text.match(/Pick up location:\s*([^\n]+)(?:\n|$)/i)?.[1]?.trim() : 'Grab';
  if (!merchant || merchant.length > 160 || /\b(?:Subtotal|Description|Amount|Drop off|Booking)\b|₱/.test(merchant)) fail('merchant pickup label is incomplete');
  const cash = method.toLowerCase() === 'cash';
  const accountName = cash ? 'Cash' : /^GCash$/i.test(method) ? 'GCash' : 'GrabPay Wallet';
  return { date: date.date, amount: (total / 100).toFixed(2), currency: 'PHP', type: 'expense', merchantRaw: merchant, merchantClean: merchant,
    description: `${food ? 'GrabFood' : 'Grab ride'} • ${refs[0]}`, categoryName: food ? 'Food & Dining' : 'Transport', accountName, institution: cash ? null : accountName, confidence: 95,
    rawPayload: { source: 'grab_email_receipt', kind: cash ? 'cash_transaction' : 'wallet_transaction', line: text, referenceNumber: refs[0], paymentMethod: accountName, accountType: cash ? 'cash' : 'wallet', payerAccountNumber: null, sourceTimestamp: date.sourceTimestamp, sourceClock: date.sourceClock, components, totalAmount: total / 100,
      parserEvidence: { currency: 'PHP', reconciled: true, noBankBalanceAnchor: true, fullNativePages: true }, sourceDocumentText: fullText } };
}

export function parseGrabEmailReceipt(text: string): { metadata: DetectedStatementMetadata; rows: ParsedImportRow[] } | null {
  const markers = text.split(/\r?\n/).filter(line => line.startsWith(prefix));
  if (!markers.length) return null;
  if (markers.length !== 1) fail('duplicate native-page proof');
  let proof: { physicalPages: number; pages: Array<{ page: number; text: string }>; pickupFields?: PickupField[] };
  try { proof = JSON.parse(markers[0].slice(prefix.length)); } catch { return fail('invalid native-page proof'); }
  if (!Number.isInteger(proof.physicalPages) || proof.physicalPages < 1 || proof.physicalPages > 100 || !Array.isArray(proof.pages) || proof.pages.length !== proof.physicalPages || proof.pages.some((p, i) => p.page !== i + 1 || typeof p.text !== 'string' || !p.text.trim())) fail('missing native pages');
  if (proof.pickupFields && (!Array.isArray(proof.pickupFields) || proof.pickupFields.some(f => typeof f.reference !== 'string' || typeof f.merchant !== 'string' || !Number.isInteger(f.page) || f.page < 1 || f.page > proof.physicalPages))) fail('invalid native restaurant column evidence');
  const body = proof.pages.map(p => p.text).join('\n').replace(/\u00a0|\u202f/g, ' ');
  const starts = [...body.matchAll(/Hope\s*you\s*(?:enjoyed|had an enjoyable)\s+(?:your\s+)?(?:food|ride)\s*!/gi)];
  if (!starts.length) fail('receipt body is missing');
  const declared = [...body.matchAll(/\b(\d+)\s+messages?\b/gi)].map(m => Number(m[1]));
  if (declared.some(n => n > starts.length)) fail('declared receipts are missing');
  const rows = starts.map((s, i) => oneReceipt(body.slice(s.index!, starts[i + 1]?.index ?? body.length), body, proof.pickupFields));
  const seen = new Map<string, string>();
  const unique = rows.filter(row => {
    const key = String(row.rawPayload!.referenceNumber);
    const contract = JSON.stringify([row.date, row.amount, row.currency, row.accountName, row.merchantRaw, row.rawPayload!.components]);
    const previous = seen.get(key);
    if (previous && previous !== contract) fail('repeated booking reference has contradictory fields');
    if (previous) return false;
    seen.set(key, contract); return true;
  });
  if (new Set(unique.map(r => r.accountName)).size !== 1) fail('mixed payment accounts require review');
  const accountName = unique[0].accountName;
  if (!accountName) fail('payment account is missing');
  const cash = accountName === 'Cash';
  return { rows: unique, metadata: { institution: cash ? null : accountName, accountName, accountNumber: null, accountType: cash ? 'cash' : 'wallet', currency: 'PHP', openingBalance: null, endingBalance: null, startDate: unique[0].date ?? null, endDate: unique.at(-1)?.date ?? null, confidence: 95, currencyConfidence: 100, institutionConfidence: cash ? 0 : 100, identityEvidence: ['grab-receipt-payment-method-only', 'Explicit receipt payment method; payer number and bank balances remain unknown', 'Complete native pages and reconciled receipt summary'] } };
}

export function hasVerifiedGrabReceiptRows(text: string, rows: Array<{ amount?: unknown; date?: unknown; rawPayload?: unknown }>): boolean {
  try {
    const source = parseGrabEmailReceipt(text);
    return Boolean(source && rows.length === source.rows.length && rows.every((r, i) => {
      const raw = r.rawPayload as Record<string, unknown> | null;
      const expected = source.rows[i].rawPayload!;
      const components = raw?.components as Array<{ label?: unknown; amount?: unknown }> | undefined;
      const required = expected.components as Array<{ label: string; amount: number }>;
      return Number(r.amount) === Number(source.rows[i].amount) && r.date === source.rows[i].date && raw?.source === 'grab_email_receipt' && raw.referenceNumber === expected.referenceNumber && raw.paymentMethod === expected.paymentMethod && raw.sourceTimestamp === expected.sourceTimestamp && raw.line === expected.line && Array.isArray(components) && components.length === required.length && components.every((c, j) => c.label === required[j].label && Number(c.amount) === required[j].amount);
    }));
  } catch { return false; }
}

export function readGrabReceiptTimestamp(payload: unknown): Date | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const raw = payload as Record<string, unknown>;
  if (raw.source !== 'grab_email_receipt' || typeof raw.sourceTimestamp !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/.test(raw.sourceTimestamp)) return null;
  const date = new Date(raw.sourceTimestamp);
  return Number.isNaN(date.getTime()) ? null : date;
}
