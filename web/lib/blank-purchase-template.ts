import { splitReceiptPromotionalFooter } from "./receipt-promotional-footer";

type BlankPurchaseTemplate = "blank_receipt_template" | "blank_invoice_template";
const heading = /^(?:(?:blank|sample)\s+)?(?:(?:official|cash|sales|tax|commercial|service|payment|purchase)\s+)?(receipt|invoice)(?:\s+(?:template|form))?$/i;
const documentFields = /^(date(?:\s+(?:issued|of purchase))?|(?:receipt|invoice)\s+(?:number|no\.?|#)|received from|sold to|bill(?:ed)? to|customer(?: name)?|buyer(?: name)?)\s*(?:[:：]\s*)?(.*)$/i;
const moneyFields = /^(grand total|total(?: amount| due| paid)?|amount (?:due|paid|received)|balance due|sub\s*total|tax|vat|unit price)\s*(?:[:：]\s*)?(.*)$/i;
const itemColumn = /^(?:item(?: description)?|description|qty\.?|quantity|unit(?: price)?|price|rate|amount|line total|sku)$/i;
const itemColumns = /^(?:(?:item(?: description)?|description|qty\.?|quantity|unit(?: price)?|price|rate|amount|line total|sku)\s*(?:[|;]\s*)?){2,}$/i;
const blank = /^(?:[₱$€£¥]\s*)?(?:(?:[_ .-]|[—–]){2,}|\[\s*\]|(?:mm[/-]dd|dd[/-]mm)[/-]yyyy|yyyy[/-]mm[/-]dd)?$/i;
const decorative = /^(?:[_ .|\-—–]{2,}|[₱$€£¥])$/u;
const templateLabel = /^(?:blank (?:form|template)|(?:receipt|invoice) template|sample (?:receipt|invoice)|(?:for (?:illustration|reference) only))$/i;

/** Require a recognizable form and affirmative blank slots. Any filled field
 * or unexplained body text leaves the original on the normal import path. */
export function classifyBlankPurchaseTemplate(source: string): BlankPurchaseTemplate | null {
  const lines = splitReceiptPromotionalFooter(source).body.normalize("NFKC")
    .split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const title = lines.findIndex((line, index) => index < 8 && heading.test(line));
  if (title < 0) return null;
  const kind = heading.exec(lines[title])?.[1].toLowerCase();
  const emptyDocumentFields = new Set<string>();
  const emptyTotals = new Set<string>();
  let hasItemColumns = false;
  const stackedColumns = new Set<string>();
  for (const line of lines.slice(title + 1)) {
    if (decorative.test(line) || templateLabel.test(line) || /^(?:thank you(?: for your purchase)?|authorized signature)\s*[.!]?$/i.test(line)) continue;
    if (itemColumn.test(line)) {
      stackedColumns.add(line.toLowerCase());
      continue;
    }
    if (line.length < 160 && itemColumns.test(line.replace(/^\|\s*|\s*\|$/g, ""))) {
      hasItemColumns = true;
      continue;
    }
    const field = documentFields.exec(line);
    const total = moneyFields.exec(line);
    if (field && blank.test(field[2])) emptyDocumentFields.add(field[1].toLowerCase());
    else if (total && blank.test(total[2])) emptyTotals.add(total[1].toLowerCase());
    else return null;
  }
  // Ignore static merchant letterhead before the title, but avoid classifying
  // a second purchase or earlier page from a mixed upload as a blank form.
  if (lines.slice(0, title).some(line => /\b(?:receipt|invoice|(?:grand )?total|amount paid)\b|[₱$€£¥]\s*\d|\d{1,4}[/-]\d{1,2}[/-]\d{1,4}/i.test(line) &&
      !templateLabel.test(line))) return null;
  if (emptyDocumentFields.size < 2 || emptyTotals.size === 0 || (!hasItemColumns && stackedColumns.size < 2 && emptyDocumentFields.size < 3)) return null;
  return kind === "invoice" ? "blank_invoice_template" : "blank_receipt_template";
}

export const blankPurchaseTemplateMessage: Record<BlankPurchaseTemplate, string> = {
  blank_receipt_template: "This looks like an unfilled receipt. Upload a completed copy showing the purchase details and total. Clover saved this file without adding a transaction.",
  blank_invoice_template: "This looks like an unfilled invoice. Upload a completed copy showing the billed details and total. Clover saved this file without adding a transaction.",
};
