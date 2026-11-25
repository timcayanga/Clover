import { readReceiptSettlementEvidence, readReceiptTenders } from "./receipt-settlement-evidence";
import { readPrintedReceiptCurrency } from "./receipt-currency-evidence";
import { joinReceiptColumnSettlement } from "./receipt-column-settlement";
import { splitReceiptPromotionalFooter } from "./receipt-promotional-footer";

export type UnsettledPurchaseDocument = "unpaid_receipt" | "purchase_order" | "quote" | "unpaid_invoice" | "unverified_invoice";

export const purchaseInvoiceHeading = /^(?:(?:tax|sales|commercial|service|billing|unpaid|overdue)\s+)?invoice(?:\s+(?:no\.?|number|#)\s*[:#]?\s*[\w/-]+|\s*[:#]\s*[\w/-]+)?\s*$/im;
const quoteHeading = /^(?:pro[ -]?forma invoice|(?:sales\s+|price\s+)?quot(?:e|ation)|(?:cost|price) estimate)(?:\s*(?:[:#]|no\.?\s+|number\s+)\s*[\w/-]+)?\s*$/im;
const statementHeading = /^(?:(?:bank|credit card|account|billing) statement|statement of account|transaction history)\b|^statement[ \t]*$/im;
const receiptHeading = /^(?:(?:official|sales|cash|payment|purchase|tax)\s+)?receipt(?:\s+(?:no\.?|number|#)\s*[:#]?\s*[\w/-]+)?\s*$/im;
const printedAmount = "(?:(?:[A-Z]{3}|RM|Rp|PHP|[₱$€£¥])\\s*)?([0-9][0-9,. ]*)";

function printedAmounts(text: string, label: string) {
  const pattern = new RegExp(`^(?:${label})[ \\t]*[:：]?[ \\t]*${printedAmount}`, "gim");
  return Array.from(text.matchAll(pattern), (match) => match[1]);
}

function hasPositiveAmount(text: string, label: string) {
  return printedAmounts(text, label).some((amount) => /[1-9]/.test(amount));
}

// Compare explicit payment and invoice amounts without treating a thousands
// separator as a decimal or dropping a contradictory currency marker.
function invoiceMoneyKey(raw: string) {
  const match = raw.trim().match(/^(?:([A-Z]{3}|[₱$€£¥])\s*)?(\d+(?:,\d{3})*\.\d{2}|\d+(?:\.\d{3})*,\d{2}|\d+)(?:\s*([A-Z]{3}|[₱$€£¥]))?$/i);
  if (!match || !/[1-9]/.test(match[2])) return null;
  const currency = (mark?: string) => mark === "₱" ? "PHP" : mark === "€" ? "EUR" : mark === "£" ? "GBP" : mark?.toUpperCase();
  const prefix = currency(match[1]), suffix = currency(match[3]);
  if (prefix && suffix && prefix !== suffix) return null;
  const amount = match[2].includes(",") && match[2].at(-3) === ","
    ? match[2].replace(/\./g, "").replace(",", ".") : match[2].replace(/,/g, "");
  return (prefix ?? suffix ?? "") + (amount.includes(".") ? amount : amount + ".00");
}

export function classifyUnsettledPurchaseDocument(source: string): UnsettledPurchaseDocument | null {
  const labelledBalanceDue = /^payment[ \t]+status[ \t]*[:：][ \t]*(?:pending|outstanding|due)[ \t]*$/im;
  const unpaidStatus = /^(?:(?:payment[ \t]+)?status[ \t]*[:：]?[ \t]*)?(?:unpaid|overdue|past due|partially paid|payment pending|pending payment|awaiting payment)[ \t]*[.!]?[ \t]*$/im;
  if (!/\b(?:invoice|quot(?:e|ation)|estimate|purchase[ \t]+order)\b/i.test(source) && !unpaidStatus.test(source) && !labelledBalanceDue.test(source)) return null;
  const text = splitReceiptPromotionalFooter(joinReceiptColumnSettlement(source)).body.split(/\r?\n/).map((line) => line.trim()).join("\n");
  if (statementHeading.test(text)) return null;
  if (quoteHeading.test(text)) return "quote";
  if (!purchaseInvoiceHeading.test(text)) {
    // Receipt references can quote a PO number. Only a stand-alone order
    // heading without a receipt heading identifies an order document.
    if (/^purchase order(?:[ \t]*(?:[:#]|no\.?|number)[ \t]*[:#]?[ \t]*[\w/-]+)?[ \t]*$/im.test(text) &&
        !receiptHeading.test(text)) return "purchase_order";
    return receiptHeading.test(text) && (unpaidStatus.test(text) || labelledBalanceDue.test(text)) ? "unpaid_receipt" : null;
  }

  const explicitlyUnpaid = labelledBalanceDue.test(text) ||
    unpaidStatus.test(text) ||
    /^(?:unpaid|overdue) invoice\b/im.test(text) ||
    hasPositiveAmount(text, "outstanding(?: balance| amount)?|balance due|remaining balance|remaining amount due");
  const zeroPaid = printedAmounts(text, "amount paid").some((amount) => !/[1-9]/.test(amount));
  if (explicitlyUnpaid || zeroPaid) return "unpaid_invoice";

  const paid = /^\s*(?:(?:payment\s+)?status\s*[:：]?\s*)?(?:paid(?: in full)?|payment (?:received|successful|approved|completed))\s*[.!]?$/im.test(text) ||
    /^(?:approval|authorization|authorisation)\s+(?:code|no\.?|number)\s*[:#]?\s*[\w-]{3,}\s*$/im.test(text) ||
    hasPositiveAmount(text, "cash tendered|amount tendered|cash received|change given|change");
  const amountPaid = hasPositiveAmount(text, "amount paid|payment received");
  // A POS invoice may print Total and Total Paid separately. Match both
  // values and currency tokens exactly before treating it as paid in full.
  const settled = [...text.matchAll(/^(?:total paid|amount paid|payment received)[ \t]*[:：]?[ \t]*([^\r\n]*\d[^\r\n]*)$/gim)];
  const billed = [...text.matchAll(/^(?:grand total|total amount|total(?=[ \t]*[:：]?[ \t]*(?:[A-Z]{3}[ \t]*)?[₱$€£¥]?[ \t]*\d))[ \t]*[:：]?[ \t]*([^\r\n]*\d[^\r\n]*)$/gim)];
  if (billed.length && settled.length) {
    const expected = invoiceMoneyKey(settled[0][1]);
    const outstanding = hasPositiveAmount(text, "amount due");
    if (expected && !outstanding && [...settled, ...billed].every(row => invoiceMoneyKey(row[1]) === expected)) return null;
    return amountPaid && outstanding ? "unpaid_invoice" : "unverified_invoice";
  }
  // Malaysian POS invoices can omit the change row for exact cash. Bind
  // the tax-inclusive total and tender to the immediately following GST recap.
  const exactGstCash = /^total[ \t]+(?:\(inclusive of gst\)|inclusive gst)[ \t]*:[ \t]*(\d+\.\d{2})\n(?:total[ \t]*:[ \t]*\1\n)?cash[ \t]*:?[ \t]*\1\nGST summary\b/im.test(text);
  if (exactGstCash && !amountPaid && !hasPositiveAmount(text, "amount due") &&
      !/^(?:card|credit|debit|visa|mastercard|wallet|gift card|voucher|change|refund|deposit|balance|amount due)\b/im.test(text) &&
      text.match(/^cash[ \t]*:?[ \t]*\d/gim)?.length === 1 &&
      !/^(?:grand total|net total|total payable|amount payable)\b/im.test(text)) return null;
  // Some MYR tills print change below one ringgit without a leading zero.
  // Require one explicitly denominated total, cash and change in that order.
  if (/^total sales[ \t]*\(inclusive(?: of)? gst\)[ \t]*:?[ \t]*RM[ \t]*\d+\.\d{2}\n(?:rounding adjustment[ \t]+RM[ \t]*[-+]?(?:\d+)?\.\d{2}\nrounding[ \t]+RM[ \t]*\d+\.\d{2}\n)?CASH[ \t]*:?[ \t]*RM[ \t]*\d+\.\d{2}\nCHANGE[ \t]*:?[ \t]*RM[ \t]*\.\d{2}$/im.test(text)) {
    const settlement = readReceiptSettlementEvidence(text);
    const tenders = readReceiptTenders(text);
    const cash = tenders.find(entry => entry.method === "cash");
    const change = tenders.find(entry => entry.method === "change");
    if (!amountPaid && !hasPositiveAmount(text, "amount due") && settlement?.kind === "payable" &&
        settlement.amount > 0 && tenders.length === 2 && cash && change &&
        Math.round(cash.amount * 100) - Math.round(change.amount * 100) === Math.round(settlement.amount * 100) &&
        readPrintedReceiptCurrency(text)?.kind !== "conflict") return null;
    return "unverified_invoice";
  }
  if (!amountPaid && !hasPositiveAmount(text, "amount due") && /^cash[ \t]*[:：]?[ \t]*\d/im.test(text)) {
    const settlement = readReceiptSettlementEvidence(text);
    const tenders = readReceiptTenders(text);
    const currency = readPrintedReceiptCurrency(text);
    if (settlement?.kind === "payable" && settlement.amount > 0 && tenders.length === 2 &&
        tenders.some(entry => entry.method === "cash" && entry.amount === settlement.amount) &&
        tenders.some(entry => entry.method === "change" && entry.amount === 0) &&
        currency?.kind !== "conflict" && /^change[ \t]*[:：]?[ \t]*0[.,]00[ \t]*$/im.test(text) &&
        !/^(?:credit card|debit card|visa|mastercard|wallet|gift card)[ \t]*[:：]?[ \t]*\d/im.test(text)) return null;
  }
  if (paid || (amountPaid && !hasPositiveAmount(text, "amount due")) || receiptHeading.test(text)) return null;
  return amountPaid ? "unpaid_invoice" : "unverified_invoice";
}

export const unsettledPurchaseDocumentMessage: Record<UnsettledPurchaseDocument, string> = {
  unpaid_receipt: "This receipt shows an outstanding payment. Upload the payment confirmation to record the expense.",
  purchase_order: "Purchase order saved. Upload the receipt or payment confirmation to record the expense.",
  quote: "Quote saved. Clover did not add an expense. Upload the receipt after you pay.",
  unpaid_invoice: "Unpaid invoice saved. Clover did not add an expense. Upload proof of payment after you pay.",
  unverified_invoice: "Invoice saved. Clover could not verify payment from this file. Upload the receipt or payment confirmation to record the expense.",
};
