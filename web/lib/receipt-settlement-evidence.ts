import { readPrintedReceiptCurrency } from "./receipt-currency-evidence";
import { joinReceiptColumnSettlement } from "./receipt-column-settlement";
import { splitReceiptPromotionalFooter } from "./receipt-promotional-footer";

const payable = /^(?:(?:grand|bill|net)\s+total|grandtotal|bill amount|due|du|tl|(?:final\s+)?amount\s+(?:due|paid|payable|to\s+pay)|sale\s+amount|total(?:\s+(?:amount|paid|due|payable|bayar|tagihan))?|jumlah\s+bayar|합\s*계|결제금액|合計)(?![\p{L}])/iu;
const subtotal = /^(?:sub\s*-?\s*total|gross amount)(?![\p{L}])/iu;
const tender = /^(?:cash(?:\s+(?:tendered|received|paid))?|tendered|amount tendered|tunai|uang diterima)(?![\p{L}])/iu;
const change = /^(?:change(?:\s+due)?|kembalian|kembali)(?![\p{L}])/iu;
const refund = /^(?:total refund|refund(?: amount| total| issued| approved| completed)?|amount refunded|refunded(?: amount)?|return total)(?![\p{L}])/iu;
const refundHeading = /^(?:refund|return|credit note)(?:\s+(?:receipt|slip|confirmation|voucher))?\s*[:：]?$/iu;
const taxHeading = /^(?:tax|vat|gst|ppn)(?:\s+(?:breakdown|summary|details|calculation))\s*[:：]?$/iu;
const settlementHeading = /^(?:settlement|payment|tender)(?:\s+(?:summary|details|breakdown))?\s*[:：]?$/iu;
const breakdownTotal = /^total\s+(?:vat\b|tax\b|gst\b|ppn\b|zero[- ]rated\b|(?:no\.?\s+of\s+)?(?:qty|quantity|items?|points?)\b|savings\b|discount\b|cash\b|tender(?:ed)?\b|change\b|refund\b)/iu;
const saleLabels = /^(?:grand\s*total|bill total|bill amount|net total|due|du|tl|jumlah bayar|total bayar|total tagihan|결제금액|amount (?:due|paid|payable|to pay)|sale amount|total (?:paid|due|payable))$/iu;
const currencyMark = /^(?:(?:[A-Z]{3}|Rp\.?|RM|(?:US|HK|S|A|C|NZ|NT)\$)\s*|[₱$€£¥฿₩₫₹]\s*)|\s*(?:[A-Z]{3}|원|円|元)$/giu;

function readAmount(raw: string) {
  let value = raw.trim().replace(/^(?:[:：=]\s*|\.\s+)/u, "").replace(currencyMark, "").trim();
  const negative = /^(?:-|−|\()/u.test(value);
  value = value.replace(/^(?:[-−+]\s*|\()/u, "").replace(/\)$/u, "").replace(currencyMark, "");
  if (!/^\d+(?:[., ]\s*\d+)*$/u.test(value)) return null;
  value = value.replace(/([.,])\s+(?=\d)/gu, "$1");
  if (value.includes(" ") && !/^\d{1,3}(?: \d{3})+(?:[.,]\d{1,2})?$/u.test(value)) return null;
  value = value.replace(/ /gu, "");
  const decimal = /([.,])(\d{1,2})$/u.exec(value);
  const whole = decimal ? value.slice(0, decimal.index) : value;
  if (/[.,]/u.test(whole) && !/^\d{1,3}([.,])\d{3}(?:\1\d{3})*$/u.test(whole)) return null;
  const cents = Number(whole.replace(/[.,]/gu, "")) * 100 + Number((decimal?.[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? (negative ? -cents : cents) : null;
}

const cardTender = /^(?:credit card|debit card|card|visa|mastercard|amex|jcb)(?:\s+(?:payment|paid))?(?![\p{L}])/iu;
const walletTender = /^(?:e[- ]?wallet|wallet|gcash|maya|paymaya|grabpay|gopay|ovo|dana|qris|apple pay|google pay)(?:\s+(?:payment|paid))?(?![\p{L}])/iu;
const otherTender = /^(?:gift card|voucher)(?![\p{L}])/iu;
const tenderLabels = [["cash", tender], ["card", cardTender], ["wallet", walletTender], ["other", otherTender], ["change", change]] as const;

export type ReceiptTender = {
  method: typeof tenderLabels[number][0];
  label: string;
  amount: number;
  currency: string | null;
  evidence: string;
};

export function readReceiptTenders(source: string): ReceiptTender[] {
  const { body } = splitReceiptPromotionalFooter(joinReceiptColumnSettlement(source));
  const lines = body.split(/\r?\n/u).map(line => line.trim()).filter(Boolean);
  return lines.flatMap((line, index) => {
    const field = line.normalize("NFKC").replace(/^(?:paid (?:by|with|via)|payment by)\s+/iu, "");
    for (const [method, pattern] of tenderLabels) {
      const label = field.match(pattern)?.[0];
      if (!label) continue;
      const remainder = field.slice(label.length).trim();
      const wrapped = /^[:：=]?$/u.test(remainder);
      const printedAmount = wrapped ? lines[index + 1] ?? "" : remainder;
      const amountText = printedAmount.replace(/^[:：=]?\s*[*•]{2,}\d{4}\s+/u, "");
      // An unlabelled four-digit card suffix may be a card identifier.
      if (method === "card" && /^[:：=]?\s*\d{4,}\s*$/u.test(amountText) &&
          !/\b(?:paid|payment)\b/iu.test(line)) return [];
      const currency = readPrintedReceiptCurrency(`TOTAL ${amountText}`);
      if (/\p{L}/u.test(amountText) && currency?.kind !== "printed") return [];
      if (/\d{10,}/u.test(amountText)) return [];
      const amount = readAmount(amountText);
      if (amount === null || amount < 0) return [];
      return [{ method, label, amount: amount / 100,
        currency: currency?.kind === "printed" ? currency.currency : null,
        evidence: wrapped ? `${line}\n${printedAmount}` : line,
      }];
    }
    return [];
  });
}

export function hasSplitReceiptTender(tenders: readonly ReceiptTender[]) {
  return new Set(tenders.filter(tender => tender.method !== "change" && tender.amount > 0).map(tender => tender.method)).size > 1;
}

export function splitTenderDifference(tenders: readonly ReceiptTender[], total: number | null, currency: string | null) {
  if (total === null || !hasSplitReceiptTender(tenders)) return null;
  const currencies = new Set(tenders.flatMap(tender => tender.currency ? [tender.currency] : []));
  if (currencies.size > 1 || (currency && currencies.size && !currencies.has(currency))) return null;
  // An identical repeated row may be a second payment or a duplicated receipt
  // copy. Preserve both observations without assuming either accounting result.
  if (new Set(tenders.map(tender => tender.evidence.toLowerCase())).size < tenders.length) return null;
  const cash = tenders.filter(tender => tender.method === "cash");
  const change = tenders.filter(tender => tender.method === "change");
  if (change.length && (change.length !== 1 || cash.length !== 1 || change[0].amount > cash[0].amount)) return null;
  const net = tenders.reduce((sum, tender) => sum + Math.round(tender.amount * 100) * (tender.method === "change" ? -1 : 1), 0);
  return (net - Math.round(total * 100)) / 100;
}

export function readReceiptRounding(source: string) {
  const { body } = splitReceiptPromotionalFooter(source.normalize("NFKC"));
  const values = new Set<number>();
  for (const line of body.split(/\r?\n/u)) {
    const match = line.trim().match(/^(?:cash rounding|round\s*-?\s*off|rounding(?: adjustment)?|pembulatan)\b(.*)$/iu);
    if (!match) continue;
    const amount = readAmount(match[1]);
    if (amount !== null) values.add(amount / 100);
  }
  return values.size === 1 ? [...values][0] : null;
}

type Settlement =
  | { kind: "payable"; amount: number }
  | { kind: "refund"; amount: number | null }
  | { kind: "conflict"; observedAmount?: number }
  | { kind: "missing_payable" };

export function readReceiptSettlementEvidence(source: string): Settlement | null {
  const { body } = splitReceiptPromotionalFooter(joinReceiptColumnSettlement(source.normalize("NFKC")));
  const lines = body.split(/\r?\n/u).map(line => line.trim().replace(/^[*•]+\s*/u, "")).filter(Boolean);
  const totals = new Set<number>();
  const finalTotals = new Set<number>();
  const refunds = new Set<number>();
  const cash = new Set<number>();
  const changes = new Set<number>();
  let inTaxSummary = false;
  let hasSupportingAmounts = false;
  const settlementCurrencies = new Set<string>();
  let isRefund = false;
  let hasOtherTender = false;
  let unreadableFinal = false;
  let recoveredEdgeNoise = false;

  for (const [index, line] of lines.entries()) {
    if (taxHeading.test(line)) {
      inTaxSummary = true;
      continue;
    }
    if (settlementHeading.test(line)) {
      inTaxSummary = false;
      continue;
    }
    if (refundHeading.test(line) || /^(?:환불\s*영수증|pengembalian dana)\s*$/iu.test(line)) isRefund = true;
    if ([cardTender, walletTender, otherTender].some(pattern => pattern.test(line)) ||
        /^paid (?:by|with|via) (?:card|wallet|visa|mastercard|gcash|maya)\b/iu.test(line)) hasOtherTender = true;
    const refundLabel = line.match(refund)?.[0];
    if (breakdownTotal.test(line) && !refundLabel) {
      hasSupportingAmounts = true;
      continue;
    }
    const totalLabel = /^due\s+date\b/iu.test(line) ? undefined : line.match(payable)?.[0];
    const cashLabel = line.match(tender)?.[0];
    const changeLabel = line.match(change)?.[0];
    const subtotalLabel = line.match(subtotal)?.[0];
    const label = refundLabel ?? totalLabel ?? cashLabel ?? changeLabel ?? subtotalLabel;
    if (!label) continue;
    const value = line.slice(label.length).trim();
    const amountText = /^[:：=]?$/u.test(value) ? lines[index + 1] ?? "" : value;
    const final = Boolean(totalLabel && saleLabels.test(totalLabel));
    // A separated OCR stroke at the right edge can follow a complete printed
    // total. Keep the full line as evidence and require intact cents.
    const amountWithEdgeNoise = final && amountText.match(/^(.*\d[.,]\d{2})[ \t]{2,}(?:[iI|:;][ \t]*){1,5}$/u);
    const cleanAmount = readAmount(amountText);
    const amount = cleanAmount ?? (amountWithEdgeNoise ? readAmount(amountWithEdgeNoise[1]) : null);
    recoveredEdgeNoise ||= cleanAmount === null && amount !== null;
    if (amount === null) {
      unreadableFinal ||= final;
      continue;
    }

    if ((totalLabel && (!inTaxSummary || final)) || cashLabel || changeLabel) {
      const currency = readPrintedReceiptCurrency(`TOTAL ${amountText}`);
      if (currency?.kind === "printed") settlementCurrencies.add(currency.currency);
    }

    if (refundLabel) refunds.add(Math.abs(amount));
    else if (final) finalTotals.add(amount);
    else if (totalLabel && !inTaxSummary) totals.add(amount);
    else if (cashLabel) cash.add(amount);
    else if (changeLabel) changes.add(amount);
    else if (subtotalLabel || totalLabel) hasSupportingAmounts = true;
  }

  const purchaseAmounts = [...totals, ...finalTotals];
  if (isRefund || refunds.size || purchaseAmounts.some(amount => amount < 0)) {
    const amounts = refunds.size ? refunds : new Set(purchaseAmounts.map(Math.abs));
    return { kind: "refund", amount: amounts.size === 1 ? [...amounts][0] / 100 : null };
  }
  if (finalTotals.size > 1) return { kind: "conflict" };
  if (unreadableFinal) {
    const observed = recoveredEdgeNoise && finalTotals.size === 1 ? [...finalTotals][0] : null;
    return observed === null ? { kind: "conflict" } : { kind: "conflict", observedAmount: observed / 100 };
  }
  const payableCandidates = finalTotals.size ? finalTotals : totals;
  const cashNet = !hasOtherTender && settlementCurrencies.size <= 1 && cash.size === 1 && changes.size === 1
    ? [...cash][0] - [...changes][0] : null;
  if (payableCandidates.size > 1) {
    // An unlabeled settlement duplicate can be disambiguated by independently
    // printed cash and change. Never manufacture a total from that difference.
    return cashNet !== null && payableCandidates.has(cashNet)
      ? { kind: "payable", amount: cashNet / 100 } : { kind: "conflict" };
  }
  const total = payableCandidates.values().next().value;
  if (total === undefined) {
    return cash.size || changes.size || hasSupportingAmounts ? { kind: "missing_payable" } : null;
  }
  if (cashNet !== null && cashNet !== total) return { kind: "conflict" };
  return { kind: "payable", amount: total / 100 };
}

export function reconcileReceiptSettlement<T extends {
  total: number | null;
  parser_evidence: { source_text?: string | null; reason: string };
}>(details: T, evidence: Settlement | null): T {
  if (!evidence) return details;
  // Dedicated parsers can deliberately leave an amount unresolved (e.g. a
  // multi-column Korean tax table). Do not turn a weak partial read into a total.
  const total = evidence.kind === "payable" && details.total !== null ? evidence.amount : null;
  if (details.total === total) return details;
  const reason = evidence.kind === "payable" ? "Used the printed payable amount."
    : evidence.kind === "refund" ? "Printed refund amount is separate from the purchase total."
    : evidence.kind === "conflict" ? "Printed settlement amounts conflict. Review the payable total."
    : "The receipt shows supporting amounts, but the payable total is missing.";
  return { ...details, total, parser_evidence: { ...details.parser_evidence, reason: `${details.parser_evidence.reason} ${reason}` } };
}
