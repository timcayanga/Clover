import { joinReceiptColumnSettlement } from "./receipt-column-settlement";
import { splitReceiptPromotionalFooter } from "./receipt-promotional-footer";

export type UnsettledPurchaseDocument = "purchase_order" | "quote" | "unpaid_invoice" | "unverified_invoice";

const invoiceHeading = /^(?:(?:tax|sales|commercial|service|billing|unpaid|overdue)\s+)?invoice(?:\s+(?:no\.?|number|#)\s*[:#]?\s*[\w/-]+|\s*[:#]\s*[\w/-]+)?\s*$/im;
const quoteHeading = /^(?:pro[ -]?forma invoice|(?:sales\s+|price\s+)?quot(?:e|ation)|(?:cost|price) estimate)(?:\s*(?:[:#]|no\.?\s+|number\s+)\s*[\w/-]+)?\s*$/im;
const statementHeading = /^(?:(?:bank|credit card|account|billing) statement|statement of account|transaction history)\b|^statement[ \t]*$/im;
const receiptHeading = /^(?:(?:official|sales|cash|payment|purchase|tax)\s+)?receipt(?:\s+(?:no\.?|number|#)\s*[:#]?\s*[\w/-]+)?\s*$/im;
const printedAmount = "(?:(?:[A-Z]{3}|Rp|PHP|[₱$€£¥])\\s*)?([0-9][0-9,. ]*)";

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
  const prefix = match[1]?.toUpperCase(), suffix = match[3]?.toUpperCase();
  if (prefix && suffix && prefix !== suffix) return null;
  const amount = match[2].includes(",") && match[2].at(-3) === ","
    ? match[2].replace(/\./g, "").replace(",", ".") : match[2].replace(/,/g, "");
  return (prefix ?? suffix ?? "") + (amount.includes(".") ? amount : amount + ".00");
}

export function classifyUnsettledPurchaseDocument(source: string): UnsettledPurchaseDocument | null {
  if (!/\b(?:invoice|quot(?:e|ation)|estimate|purchase[ \t]+order)\b/i.test(source)) return null;
  const text = splitReceiptPromotionalFooter(joinReceiptColumnSettlement(source)).body.split(/\r?\n/).map((line) => line.trim()).join("\n");
  if (statementHeading.test(text)) return null;
  if (quoteHeading.test(text)) return "quote";
  if (!invoiceHeading.test(text)) {
    // Receipt references can quote a PO number. Only a stand-alone order
    // heading without a receipt heading identifies an order document.
    if (/^purchase order(?:[ \t]*(?:[:#]|no\.?|number)[ \t]*[:#]?[ \t]*[\w/-]+)?[ \t]*$/im.test(text) &&
        !receiptHeading.test(text)) return "purchase_order";
    return null;
  }

  const explicitlyUnpaid = /^payment\s+status\s*[:：]\s*(?:pending|outstanding|due)\s*$/im.test(text) ||
    /^(?:(?:payment\s+)?status\s*[:：]?\s*)?(?:unpaid|past due|overdue|payment pending|pending payment|awaiting payment|partially paid)\s*[.!]?$/im.test(text) ||
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
  if (paid || (amountPaid && !hasPositiveAmount(text, "amount due")) || receiptHeading.test(text)) return null;
  return amountPaid ? "unpaid_invoice" : "unverified_invoice";
}

export const unsettledPurchaseDocumentMessage: Record<UnsettledPurchaseDocument, string> = {
  purchase_order: "Purchase order saved. Upload the receipt or payment confirmation to record the expense.",
  quote: "Quote saved. Clover did not add an expense. Upload the receipt after you pay.",
  unpaid_invoice: "Unpaid invoice saved. Clover did not add an expense. Upload proof of payment after you pay.",
  unverified_invoice: "Invoice saved. Clover could not verify payment from this file. Upload the receipt or payment confirmation to record the expense.",
};
