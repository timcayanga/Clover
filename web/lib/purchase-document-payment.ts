import { splitReceiptPromotionalFooter } from "./receipt-promotional-footer";

export type UnsettledPurchaseDocument = "quote" | "unpaid_invoice" | "unverified_invoice";

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

export function classifyUnsettledPurchaseDocument(source: string): UnsettledPurchaseDocument | null {
  const text = splitReceiptPromotionalFooter(source).body.split(/\r?\n/).map((line) => line.trim()).join("\n");
  if (statementHeading.test(text)) return null;
  if (quoteHeading.test(text)) return "quote";
  if (!invoiceHeading.test(text)) return null;

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
  if (paid || (amountPaid && !hasPositiveAmount(text, "amount due")) || receiptHeading.test(text)) return null;
  return amountPaid ? "unpaid_invoice" : "unverified_invoice";
}

export const unsettledPurchaseDocumentMessage: Record<UnsettledPurchaseDocument, string> = {
  quote: "Quote saved. Clover did not add an expense. Upload the receipt after you pay.",
  unpaid_invoice: "Unpaid invoice saved. Clover did not add an expense. Upload proof of payment after you pay.",
  unverified_invoice: "Invoice saved. Clover could not verify payment from this file. Upload the receipt or payment confirmation to record the expense.",
};
