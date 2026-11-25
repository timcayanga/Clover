import { readPrintedReceiptCurrency } from "./receipt-currency-evidence";
import { joinReceiptColumnSettlement } from "./receipt-column-settlement";
import { splitReceiptPromotionalFooter } from "./receipt-promotional-footer";

const payable = /^(?:(?:net\s+)?total\s+rounded|(?:grand|bill|net)\s+total|grandtotal|bill amount|due|du|tl|(?:final\s+)?amount\s+(?:due|paid|payable|to\s+pay)|sale\s+amount|total(?:\s+incl\.[ \t]+gst[ \t]*@[ \t]*6%|\s+sales\s*\(inclusive(?: of)? gst\)|\s+(?:amount|paid|due|payable|bayar|tagihan))?|jumlah\s+bayar|합\s*계|결제금액|合計)(?![\p{L}])/iu;
const subtotal = /^(?:sub\s*-?\s*total|gross amount)(?![\p{L}])/iu;
const tender = /^(?:cash(?!\s+changed\b)(?:\s+(?:tendered|received|paid))?|tendered|amount tendered|tunai|uang diterima)(?![\p{L}])/iu;
const change = /^(?:cash\s+changed|change(?:\s+due)?|kembalian|kembali)(?![\p{L}])/iu;
const refund = /^(?:total refund|refund(?: amount| total| issued| approved| completed)?|amount refunded|refunded(?: amount)?|return total)(?![\p{L}])/iu;
const refundHeading = /^(?:refund|return|credit note)(?:\s+(?:receipt|slip|confirmation|voucher))?\s*[:：]?$/iu;
const taxHeading = /^(?:tax|vat|gst|ppn)(?:\s+(?:breakdown|summary|details|calculation))\s*[:：]?$/iu;
const settlementHeading = /^(?:settlement|payment|tender)(?:\s+(?:summary|details|breakdown))?\s*[:：]?$/iu;
const breakdownTotal = /^total\s+(?:vat\b|tax\b|gst\b|ppn\b|zero[- ]rated\b|(?:no\.?\s+of\s+)?(?:qty|quantity|items?|points?)\b|savings\b|discount\b|cash\b|tender(?:ed)?\b|change\b|refund\b)/iu;
const saleLabels = /^(?:(?:net\s+)?total\s+rounded|grand\s*total|bill total|bill amount|net total|due|du|tl|jumlah bayar|total bayar|total tagihan|결제금액|amount (?:due|paid|payable|to pay)|sale amount|total (?:paid|due|payable))$/iu;
const currencyMark = /^(?:(?:[A-Z]{3}|P(?=\s*\d)|Rp\.?|RM|(?:US|HK|S|A|C|NZ|NT)\$)\s*|[₱$€£¥฿₩₫₹]\s*)|\s*(?:[A-Z]{3}|[₱$€£¥฿₩₫₹원円元])$/giu;

function readAmount(raw: string) {
  let value = raw.trim().replace(/^(?:[:：=]\s*|\.\s+)/u, "").replace(currencyMark, "").trim();
  const negative = /^(?:-|−|\()/u.test(value);
  value = value.replace(/^(?:[-−+]\s*|\()/u, "").replace(/\)$/u, "").replace(currencyMark, "");
  if (/^\.\d{2}$/.test(value)) value = "0" + value;
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

// Normalize only the three adjacent till rows. Preserve the original
// transcript and require independent cash-minus-change evidence downstream.
function normalizeRinggitRegister(source: string) {
  // In this cash layout "Total Paid" is the tender before change.
  // Keep all three printed amounts; the ordinary POS reconciliation checks them.
  if (/^payment type:[ \t]*cash[ \t]*$/im.test(source)) {
    source = source.replace(/^grand tota[l1][ \t]*RM[ \t]*(\d+\.\d{2})[ \t]*\r?\ntotal paid[ \t]+RM[ \t]*(\d+\.\d{2})[ \t]*\r?\nchange[ \t]+RM[ \t]*(\d+\.\d{2})[ \t]*$/gim,
      "Amount to be paid RM $1\nCash RM $2\nChange RM $3");
  }
  return source.replace(/^total after rounding[ \t]+(\d+\.\d{2})\r?\ncash[ \t]+(\d+\.\d{2})\r?\nchange cash[ \t]+(\d+\.\d{2})$/gim,
    "Amount to be paid $1\nCash $2\nChange $3").replace(/^(?:rounded total[ \t]*\(RM\)[ \t]*:|total incl gst)[ \t]*(\d+\.\d{2})[ \t]*\r?\n(?:pay[ \t]+)?cash[ \t]+(\d+\.\d{2})[ \t]*\r?\n(?:cash[ \t]+)?change[ \t]+(\d+\.\d{2})[ \t]*$/gim,
    "Amount to be paid $1\nCash $2\nChange $3");
}

export function readReceiptTenders(source: string): ReceiptTender[] {
  const { body } = splitReceiptPromotionalFooter(joinReceiptColumnSettlement(source));
  const lines = normalizeRinggitRegister(body).split(/\r?\n/u).map(line => line.trim()).filter(Boolean);
  const originalLines = body.split(/\r?\n/u).map(line => line.trim()).filter(Boolean);
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
        evidence: wrapped ? `${originalLines[index]}\n${printedAmount}` : originalLines[index],
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
  const lines = normalizeRinggitRegister(body).split(/\r?\n/u).map(line => line.trim().replace(/^[*•]+\s*/u, "")).filter(Boolean);
  const totals = new Set<number>();
  const finalTotals = new Set<number>();
  const contextualTotals = new Set<number>();
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
  let garbledFinalAmount = false;

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
    // This register prints the currency in the label, before its colon.
    // Bind the pre-rounding net to its adjustment and final cash amount.
    if (!inTaxSummary && /^net total[ \t]*\(MYR\)/i.test(line) &&
        /^net total rounded[ \t]*\(MYR\)/i.test(lines[index + 2] ?? "")) {
      const before = /^net total[ \t]*\(MYR\)[ \t]*:[ \t]*(\d+\.\d{2})$/i.exec(line);
      const adjustment = /^rounding adj\.?[ \t]*:[ \t]*([-+]?\d+\.\d{2})$/i.exec(lines[index + 1]);
      const after = /^net total rounded[ \t]*\(MYR\)[ \t]*:[ \t]*(\d+\.\d{2})$/i.exec(lines[index + 2]);
      const gross = before && readAmount(before[1]);
      const delta = adjustment && readAmount(adjustment[1]);
      const net = after && readAmount(after[1]);
      if (gross == null || delta == null || net == null || Math.abs(delta) > 2 || gross + delta !== net) {
        unreadableFinal = true;
      } else {
        contextualTotals.add(net);
        settlementCurrencies.add("MYR");
      }
      continue;
    }
    if (/^net total rounded[ \t]*\(MYR\)/i.test(line) &&
        /^net total[ \t]*\(MYR\)/i.test(lines[index - 2] ?? "") && !inTaxSummary) continue;
    // Some ringgit tills use "Rounding" for the final amount and print the
    // signed adjustment separately. Require both calculations to reconcile.
    const rounded = /^rounding[ \t]+RM[ \t]*([\d,.]+)$/iu.exec(line);
    if (rounded && !inTaxSummary && index >= 2) {
      const adjustment = /^rounding adjustment[ \t]+RM[ \t]*([-+]?[\d.]+)$/iu.exec(lines[index - 1]);
      const gross = /^total sales[ \t]*\(inclusive(?: of)? GST\)[ \t]*RM[ \t]*([\d,.]+)$/iu.exec(lines[index - 2]);
      if (adjustment && gross) {
        const delta = readAmount(adjustment[1]);
        const before = readAmount(gross[1]);
        const after = readAmount(rounded[1]);
        if (delta === null || before === null || after === null || Math.abs(delta) > 2 || before + delta !== after) {
          unreadableFinal = true;
        } else {
          contextualTotals.add(after);
          settlementCurrencies.add("MYR");
        }
      }
    }
    // This terminal prints its payable as “Nett Total” after a zero-tax
    // calculation. The contextual amount also has to reconcile with tender.
    const nett = /^nett total:[ \t]*RM[ \t]*(\d+\.\d{2})$/iu.exec(line);
    if (nett && !inTaxSummary) {
      const delta = /^rounding:[ \t]*([-+]?)RM[ \t]*(0\.\d{2})$/iu.exec(lines[index - 1] ?? "");
      const taxIndex = index - (delta ? 2 : 1);
      const gross = /^total amount:[ \t]*RM[ \t]*(\d+\.\d{2})$/iu.exec(lines[taxIndex - 1] ?? "");
      const adjustment = delta ? readAmount(delta[1] + delta[2]) : 0;
      const value = readAmount(nett[1]);
      const before = gross && readAmount(gross[1]);
      if (/^gst[ \t]*@[ \t]*0%:[ \t]*RM[ \t]*0\.00$/iu.test(lines[taxIndex] ?? "") &&
          before != null && value != null && adjustment != null && Math.abs(adjustment) <= 2 && before + adjustment === value) {
        contextualTotals.add(value);
        settlementCurrencies.add("MYR");
      } else {
        unreadableFinal = true;
      }
    }
    const finalCashTotal = /^final total\s+(\d+\.\d{2})$/iu.exec(line);
    if (!inTaxSummary && finalCashTotal && /^cash\s+\d+\.\d{2}$/iu.test(lines[index + 1] ?? "") &&
        /^change\s+\d+\.\d{2}$/iu.test(lines[index + 2] ?? "") && /\b(?:amount|amt|tax)\s*\(RM\)/iu.test(body)) {
      const value = readAmount(finalCashTotal[1]);
      if (value !== null) finalTotals.add(value);
    }
    const refundLabel = line.match(refund)?.[0];
    if (breakdownTotal.test(line) && !refundLabel) {
      hasSupportingAmounts = true;
      continue;
    }
    // These POS labels identify a rounded or dine-in amount. Require the
    // independent cash/change arithmetic before preferring it to a subtotal.
    const ringgitInclusiveLabel = line.match(/^total incl\.[ \t]+GST[ \t]*0?6%(?=[ \t]+RM[ \t]*\d+[.]\d{2}$)/iu)?.[0];
    const posLabel = ringgitInclusiveLabel ?? line.match(/^(?:ttl atf rnd|amount to be paid|total amount paid(?=[ \t]+PHP\b)|total \(eat in\))(?=$|[ \t:：])/iu)?.[0];
    const totalLabel = posLabel ?? (/^due\s+date\b/iu.test(line) ? undefined : line.match(payable)?.[0]);
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
      unreadableFinal ||= final || Boolean(posLabel && !inTaxSummary);
      garbledFinalAmount ||= final && /^\/\s*\d/u.test(amountText) && /\p{L}/u.test(amountText);
      continue;
    }

    if ((totalLabel && (!inTaxSummary || final)) || cashLabel || changeLabel) {
      const currency = readPrintedReceiptCurrency(`TOTAL ${amountText}`);
      if (currency?.kind === "printed") settlementCurrencies.add(currency.currency);
    }

    if (posLabel && !inTaxSummary) contextualTotals.add(amount);
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
    const observed = (recoveredEdgeNoise || garbledFinalAmount) && finalTotals.size === 1 ? [...finalTotals][0] : null;
    return observed === null ? { kind: "conflict" } : { kind: "conflict", observedAmount: observed / 100 };
  }
  const payableCandidates = finalTotals.size ? finalTotals : totals;
  const cashNet = !hasOtherTender && settlementCurrencies.size <= 1 && cash.size === 1 && changes.size === 1
    ? [...cash][0] - [...changes][0] : null;
  if (contextualTotals.size) {
    if (cashNet === null || cashNet <= 0 || contextualTotals.size !== 1 || !contextualTotals.has(cashNet) ||
        (finalTotals.size && !finalTotals.has(cashNet))) return { kind: "conflict" };
    return { kind: "payable", amount: cashNet / 100 };
  }
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
