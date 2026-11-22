import { inspectBankingScreenshot } from "./banking-screenshot-evidence";
import { hasReceiptPhotoEvidence } from "./receipt-intake";
import { classifyUnsettledPurchaseDocument } from "./purchase-document-payment";
import { readReceiptOpticalLayout } from "./local-receipt-ocr-envelope";

const statementHeading = /^[ \t]*(?:statement of account|(?:bank|account|credit card) statement)\b/im;
const statementColumns = /^[ \t]*(?:posting |transaction |value )?date\b[^\r\n]*\b(?:description|details|particulars)\b[^\r\n]*\b(?:debit|credit|withdrawal|deposit|amount|balance)\b/im;
const datedAmountRow = /^[ \t]*(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})[ \t]+\S[^\r\n]*?(?:\([₱$€£]?\d[\d,]*\.\d{2}\)|\d[\d,]*\.\d{2}(?:[ \t]*(?:CR|DR))?)[ \t]*$/gim;

/** A route describes what to extract. Row validation still owns amounts and posting decisions. */
export function resolvePositiveImportDocumentRoute(source: string) {
  const text = readReceiptOpticalLayout(source);
  if (!text.trim() || classifyUnsettledPurchaseDocument(text)) return null;
  const banking = inspectBankingScreenshot(text);
  if (banking.kind === "history") return { mode: "statement", rule: "dated_banking_activity" } as const;
  if (banking.kind !== "unknown") return null;
  const receipt = hasReceiptPhotoEvidence(text);
  const columns = statementHeading.test(text) ? statementColumns.exec(text) : null;
  const rows = columns ? text.slice(columns.index + columns[0].length).matchAll(datedAmountRow) : null;
  const transactions = rows ? [...rows].filter(row => !/\b(?:opening|closing|starting|ending) balance\b/i.test(row[0])) : [];
  const statement = transactions.length >= 2;
  if (statement && receipt) return null;
  if (statement) return { mode: "statement", rule: "statement_heading_columns_and_rows" } as const;
  if (receipt) return { mode: "receipt", rule: "receipt_with_settlement_evidence" } as const;
  return null;
}


/** These hints select a reader only. Incomplete device text is never used to save a row. */
export function resolveEarlyPhotoImportRoute(source: string, deviceText: string) {
  const sourceRoute = resolvePositiveImportDocumentRoute(source);
  const deviceRoute = resolvePositiveImportDocumentRoute(deviceText);
  // A dated activity list can contain a merchant and a receipt reference.
  // Prefer the ledger reader when either full-frame reading establishes it.
  if (sourceRoute?.mode === "statement") return sourceRoute;
  if (deviceRoute?.mode === "statement") return deviceRoute;
  return sourceRoute ?? deviceRoute;
}
