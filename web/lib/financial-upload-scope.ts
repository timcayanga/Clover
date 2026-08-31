export type FinancialUploadScopeDecision = {
  decision: "financial" | "ambiguous" | "non_financial";
  confidence: number;
  reasons: string[];
  kind?: "promotion" | "general_document";
};

export const NON_FINANCIAL_UPLOAD_MESSAGE =
  "This does not look like a financial record Clover can import. Try a receipt, statement, invoice, transaction screenshot, portfolio record, or financial note instead.";
export const PROMOTIONAL_UPLOAD_MESSAGE =
  "This looks like a coupon, voucher, or promotion rather than proof of a completed purchase. Try uploading the full receipt showing the purchase date and total amount.";

const FINANCIAL_HEADERS = /\b(?:date|description|details|merchant|reference|transaction)\b[\s,;|\t]{1,20}\b(?:amount|balance|credit|debit|total)\b/i;
const CURRENCY_SIGNAL = /(?:\b(?:AED|AUD|BDT|BHD|BRL|CAD|CHF|CNY|EUR|GBP|HKD|IDR|INR|JPY|KRW|MYR|PHP|RMB|SAR|SGD|THB|TWD|USD|VND)\b|[₱$€£¥₹฿₫₩])/i;
const AMOUNT_SIGNAL = /(?:[₱$€£¥₹฿₫₩]\s*)?\d{1,3}(?:[,. ]\d{3})*(?:[.,]\d{2})(?!\d)/;
const DATE_SIGNAL = /(?:\b\d{1,4}[\/-]\d{1,2}[\/-]\d{1,4}\b|\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}\b)/i;
const NON_FINANCIAL_WORDS = /\b(?:agenda|article|assignment|biography|curriculum vitae|essay|meeting minutes|poem|recipe|resume|source code|statement of purpose|syllabus)\b/i;
const PROMOTIONAL_WORDS = /\b(?:advertisement|coupon|discount code|flyer|menu|promo(?:tion|tional)?|redeem|special offer|voucher)\b/i;
const COMPLETED_PURCHASE_WORDS = /\b(?:amount due|cash tendered|change due|grand total|invoice number|paid|payment method|receipt number|subtotal|tax|total due|transaction id)\b/i;
const FINANCIAL_FILE_NAME = /(?:bank|bill|budget|cash|credit|invoice|payment|portfolio|receipt|transaction|wallet)/i;
const STRUCTURED_FINANCIAL_FILE = /\.(?:csv|tsv|xls|xlsx|xlsm|xlsb|ods)$/i;
const countMatches = (value: string, pattern: RegExp) => new Set(value.match(pattern) ?? []).size;

export const assessFinancialUploadScope = (params: {
  text?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  parsedRowsCount?: number;
  metadataConfidence?: number | null;
  hasInstitution?: boolean;
}): FinancialUploadScopeDecision => {
  const text = (params.text ?? "").replace(/\s+/g, " ").trim();
  const fileName = params.fileName ?? "";
  const reasons: string[] = [];
  const hasAmount = AMOUNT_SIGNAL.test(text);
  const hasDate = DATE_SIGNAL.test(text);
  const hasCurrency = CURRENCY_SIGNAL.test(text);
  const looksPromotional = PROMOTIONAL_WORDS.test(text);
  const hasCompletedPurchaseEvidence = COMPLETED_PURCHASE_WORDS.test(text);
  const financialWordCount = countMatches(
    text.toLowerCase(),
    /\b(?:account|amount|balance|bank|billing|cash|credit|currency|debit|deposit|due|fee|invoice|merchant|paid|payment|purchase|receipt|statement|subtotal|tax|total|transaction|transfer|withdrawal)\b/g
  );
  const investmentWordCount = countMatches(
    text.toLowerCase(),
    /\b(?:asset|broker|dividend|fund|holding|investment|maturity|principal|security|shares?|stock|units?)\b/g
  );

  if ((params.parsedRowsCount ?? 0) > 0) reasons.push("deterministic financial rows");
  if ((params.metadataConfidence ?? 0) >= 75) reasons.push("high-confidence financial metadata");
  if (params.hasInstitution && (hasAmount || hasDate || financialWordCount > 0 || investmentWordCount > 0)) {
    reasons.push("financial institution with document evidence");
  }
  if (FINANCIAL_HEADERS.test(text)) reasons.push("financial table headers");
  if (hasCurrency && (hasAmount || hasDate)) reasons.push("currency and amount/date evidence");
  if (financialWordCount >= 2 && (hasAmount || hasDate)) reasons.push("financial vocabulary with values");
  if (investmentWordCount >= 2 && (hasAmount || hasDate || hasCurrency)) reasons.push("investment vocabulary with values");
  if (FINANCIAL_FILE_NAME.test(fileName) && (hasAmount || hasDate || financialWordCount > 0 || investmentWordCount > 0)) reasons.push("financial filename with document evidence");
  if (STRUCTURED_FINANCIAL_FILE.test(fileName) && (FINANCIAL_HEADERS.test(text) || hasAmount)) reasons.push("structured financial data");

  // Coupons and promotional cards often contain prices, expiry dates, and a
  // merchant name. Reject them only when they lack evidence that money
  // actually changed hands, so a receipt carrying a coupon line still passes.
  if (looksPromotional && !hasCompletedPurchaseEvidence && !FINANCIAL_HEADERS.test(text)) {
    return {
      decision: "non_financial",
      confidence: 96,
      reasons: ["promotion without completed purchase evidence"],
      kind: "promotion",
    };
  }

  if (reasons.length > 0) {
    return { decision: "financial", confidence: Math.min(99, 68 + reasons.length * 8), reasons };
  }

  // Sparse OCR and ordinary camera filenames are inconclusive. They must keep
  // the visual fallback path so foreign-language and low-light receipts are
  // not rejected merely because local OCR could not read them.
  if (text.length < 160) {
    return { decision: "ambiguous", confidence: 0, reasons: ["insufficient local text for a safe rejection"] };
  }

  const digitRatio = (text.match(/\d/g)?.length ?? 0) / Math.max(1, text.length);
  const strongNegative = NON_FINANCIAL_WORDS.test(text) && !FINANCIAL_HEADERS.test(text) && !(hasCurrency && hasAmount);
  if (strongNegative || (text.length >= 320 && digitRatio < 0.015 && !DATE_SIGNAL.test(text) && !AMOUNT_SIGNAL.test(text))) {
    return {
      decision: "non_financial",
      confidence: strongNegative ? 96 : 88,
      reasons: [strongNegative ? "non-financial document vocabulary" : "long prose without financial values or structure"],
      kind: "general_document",
    };
  }

  return { decision: "ambiguous", confidence: 0, reasons: ["local evidence is inconclusive"] };
};

export const getNonFinancialUploadMessage = (decision: FinancialUploadScopeDecision) =>
  decision.kind === "promotion" ? PROMOTIONAL_UPLOAD_MESSAGE : NON_FINANCIAL_UPLOAD_MESSAGE;

export const isNonFinancialUploadError = (value: unknown) => {
  const message = value instanceof Error ? value.message : String(value ?? "");
  return message.includes(NON_FINANCIAL_UPLOAD_MESSAGE) || message.includes(PROMOTIONAL_UPLOAD_MESSAGE);
};
