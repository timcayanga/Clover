import { readReconciledItemTable } from "./receipt-item-table";
import { readReceiptOpticalLayout } from "./local-receipt-ocr-envelope";
import { readPrintedReceiptCurrency } from "./receipt-currency-evidence";
import { hasLocalizedReceiptEvidence, hasLocalizedUnpaidStatus } from "./localized-receipt-cues";
import { splitReceiptPromotionalFooter } from "./receipt-promotional-footer";
import { normalizeReceiptCaptureLocation, locationMatchesReceiptDate } from "../../shared/receipt-capture-location";
import { getRegionalParsingProfile } from "./context-corpus";
import { normalizeDefaultCurrency } from "./regional-preferences";
import { readMerchantPaymentConfirmation } from "./merchant-payment-confirmation";

/** Classify the document, not a camera filename or incidental crypto substring. */
export function hasReceiptPhotoEvidence(text: string) {
  const source = text.normalize("NFKC");
  if (hasLocalizedUnpaidStatus(source)) return false;
  if (readMerchantPaymentConfirmation(source) || hasLocalizedReceiptEvidence(source)) return true;
  const receiptHeader = /\b(?:sales\s*invoice|inv(?:oice)?\.?\s*(?:no\.?|number|#)\s*:?|official\s*receipt|sales\s*receipt|receipt\s*(?:no|number|#)|cashier|struk|kuitansi|kwitansi)\b|영수증|승인번호|領収書|收据|收據/iu.test(source) || /(?:^|\n)\s*(?:receipt|invoice|expense\s+record)\s*(?:\n|$)/iu.test(source);
  const settlement = /\b(?:grand\s*total|total(?:\s+(?:due|amount|payment))?|amount\s*(?:due|to\s+pay)|sale\s+amount|subtotal|vat(?:able)?\s*(?:sales|amount)|payment\s*(?:type|method)|kembalian)\b|합\s*계|결제금액|받을금액/iu.test(source);
  const statementTable = /\b(?:transaction\s+history|account\s+activity|past\s+transactions|recent\s+transactions)\b|\b(?:opening|closing|starting|ending)\s+balance\b|\b(?:debit|withdrawal)\s+(?:credit|deposit)\s+balance\b|거래일자\s+입금\s+출금/iu.test(source);
  const printedPaidTotal = /^\s*total\s+paid\s*[:.]?\s*(?:(?:PHP|USD|EUR|GBP|SGD|MYR|IDR|₱|\$|€|£)\s*)\d[\d,]*\.\d{2}\s*$/imu.test(source);
  // Restaurants often print BILL, with all labels before the amount column.
  // Classification does not invent an amount or bypass receipt validation.
  const itemizedBill = /^\s*(?:temporary\s+)?bill\s*$/imu.test(source) &&
    /\b(?:table|dine\s*in|take\s*out|order)\b/iu.test(source) &&
    /\d\s*[x×@]\s*(?:P(?:HP)?|₱|\$)?\s*\d/iu.test(source) &&
    /\b(?:subtotal|sub\s+total|amount\s+due|service\s+charge)\b/iu.test(source);
  const cardTerminalSlip = /\bmerchant\s+id\b/iu.test(source) && /\bterminal\s+id\b/iu.test(source) &&
    /\bcard\s+type\b/iu.test(source) && /\btransaction\s+type\s*:?\s*sale\b/iu.test(source) &&
    /\bsale\s+amount\b/iu.test(source) && /\bapproved\b/iu.test(source);
  const retailSettlement = /\bsub\s*total\b/iu.test(source) && /\bamount\s+to\s+pay\b/iu.test(source) &&
    /\b(?:VAT|TIN|GCash|cashier)\b/iu.test(source);
  return !statementTable && settlement && /\d/.test(source) &&
    (receiptHeader || printedPaidTotal || itemizedBill || cardTerminalSlip || retailSettlement || Boolean(readReconciledItemTable(source)));
}

export function shouldRecoverEmptyStatementImageAsReceipt(params: {
  image: boolean;
  mode: string;
  transactionHistory: boolean;
  hasStatementRows: boolean;
  hasSavedRows: boolean;
  opticalText: string;
}) {
  return params.image && params.mode === "statement" && !params.transactionHistory &&
    !params.hasStatementRows && !params.hasSavedRows && hasReceiptPhotoEvidence(readReceiptOpticalLayout(params.opticalText));
}

/** Reuse only evidence from this saved image. A statement signal in any reading
 * keeps it out of receipt recovery, even if another reading looks like a purchase. */
export function selectSavedStatementReceiptText(
  context: Omit<Parameters<typeof shouldRecoverEmptyStatementImageAsReceipt>[0], "opticalText">,
  candidates: readonly (string | null | undefined)[],
  isStatement: (text: string) => boolean,
) {
  if (!context.image || context.mode !== "statement" || context.transactionHistory ||
      context.hasStatementRows || context.hasSavedRows) return null;
  const readings = candidates.flatMap(candidate => {
    const text = candidate ? readReceiptOpticalLayout(candidate).trim() : "";
    return text ? [text] : [];
  });
  if (readings.some(isStatement)) return null;
  return readings.find(opticalText => shouldRecoverEmptyStatementImageAsReceipt({ ...context, opticalText })) ?? null;
}

type ReceiptCurrencyDetails = {
  currency: string | null;
  transaction_date?: string | null;
  receipt_type?: string | null;
  line_items?: Array<{ currency?: string | null; parser_evidence?: { reason?: string | null } }>;
  confidence_score: number;
  parser_evidence: { reason: string; source_text?: string | null; page?: number | null };
  currency_resolution?: { source?: string; original?: string | null; currency?: string | null; requiresReview?: boolean; evidence?: string; confidence?: number; countryCode?: string };
};

/** Strong printed location clues suggest a currency, never rewrite source text.
 * Conflicting regions deliberately fall back to the user's preference. */
function receiptLocationCandidates(text: string) {
  const source = text.normalize("NFKC");
  const regions: [string, RegExp][] = [
    ["PHP", /\bPhilippines\b|\b(?:Makati|Mandaluyong|Taguig|Pasig|Quezon|Cebu|Davao)\s+City\b|\bBIR\b.{0,50}\b(?:permit|accr(?:ed(?:itation)?)?|TIN)\b/i],
    ["IDR", /\bIndonesia\b|\b(?:Jakarta|Surabaya|Bandung|Denpasar)\b.{0,60}\b\d{5}\b/i],
    ["KRW", /\b(?:South Korea|Republic of Korea)\b|(?:서울|부산|인천|대구|대전|광주|울산)(?:특별시|광역시)|대한민국/u],
    ["SGD", /\bSingapore\s+\d{6}\b/i],
    ["MYR", /\bMalaysia\b/i], ["THB", /\bThailand\b/i],
    ["VND", /\bViet\s*Nam\b/i], ["JPY", /\bJapan\b|日本国/u],
    ["HKD", /\bHong Kong\b/i], ["AUD", /\bAustralia\b/i], ["CAD", /\bCanada\b/i],
    ["CNY", /\b(?:mainland China|People.s Republic of China)\b|中华人民共和国/u],
    ["TWD", /\bTaiwan\b/i],
    ["NZD", /\bNew Zealand\b/i], ["GBP", /\bUnited Kingdom\b/i],
    ["USD", /\bUnited States(?: of America)?\b/i],
  ];
  const matches = regions.flatMap(([currency, pattern]) => {
    const match = source.match(pattern);
    return match ? [{ currency, evidence: match[0] }] : [];
  });
  return matches;
}

export function inferReceiptLocationCurrency(text: string) {
  const matches = receiptLocationCandidates(text);
  return matches.length === 1 ? matches[0] : null;
}

/** Currency on the draft is separate from the parser's original value and source text. */
export function applyReceiptDefaultCurrency<T extends ReceiptCurrencyDetails>(details: T, defaultCurrency: string, receiptText = "", captureLocation?: unknown): T {
  const previous = details.currency_resolution;
  // An edited value with an existing resolution has been explicitly changed.
  if (previous && previous.currency !== details.currency) return details;
  const original = previous ? previous.original ?? null : details.currency;
  const optical = readReceiptOpticalLayout(receiptText).trim();
  const transcript = readReceiptOpticalLayout(details.parser_evidence.source_text ?? "").trim();
  const sourceText = optical || transcript;
  const locations = receiptLocationCandidates(splitReceiptPromotionalFooter(sourceText).body);
  const location = locations.length === 1 ? locations[0] : null;
  const printed = readPrintedReceiptCurrency(sourceText, location?.currency);
  const hint = normalizeReceiptCaptureLocation(captureLocation);
  const deviceCurrency = locations.length === 0 && hint && locationMatchesReceiptDate(hint, details.transaction_date)
    ? getRegionalParsingProfile(hint.countryCode)?.defaultCurrency : null;
  const parserCurrency = details.currency?.trim().toUpperCase();
  const typedDocument = details.receipt_type === "wallet_transfer" || details.receipt_type === "travel_ticket";
  const canRetainParserCurrency = (!previous || previous.source === "parser_currency") && typedDocument && parserCurrency &&
    /^[A-Z]{3}$/u.test(parserCurrency) && parserCurrency !== "XXX";

  let resolution: NonNullable<ReceiptCurrencyDetails["currency_resolution"]>;
  if (printed?.kind === "conflict") {
    resolution = { source: "printed_conflict", currency: null, requiresReview: true, evidence: printed.currencies.join(", ") };
  } else if (printed?.kind === "printed") {
    resolution = { source: "printed_currency", currency: printed.currency, requiresReview: false, evidence: /^(?:[$¥])$/u.test(printed.evidence) && location
      ? `${printed.evidence} · ${location.evidence}` : printed.evidence };
  } else if (location) {
    resolution = { source: "receipt_location", currency: location.currency, requiresReview: false, evidence: location.evidence };
  } else if (canRetainParserCurrency) {
    resolution = { source: "parser_currency", currency: parserCurrency, requiresReview: false };
  } else if (deviceCurrency && hint) {
    resolution = { source: "device_location", currency: deviceCurrency, requiresReview: false,
      evidence: `Optional capture country: ${hint.countryCode}`, countryCode: hint.countryCode, confidence: 0.7 };
  } else {
    resolution = { source: "user_default", currency: normalizeDefaultCurrency(defaultCurrency), requiresReview: false,
      evidence: locations.length > 1 ? `Conflicting printed regions: ${locations.map(entry => entry.currency).sort().join(", ")}` : "Profile default currency" };
  }
  const resolved = resolution.currency ?? null;
  // These OCR items inherited the preview's receipt-wide currency. Preserve
  // independently supplied item currencies from dedicated or backup parsers.
  const lineItems = details.line_items?.map(item =>
    item.parser_evidence?.reason === "Receipt line item parsed from OCR" && item.currency !== resolved
      ? { ...item, currency: resolved }
      : item,
  );
  return {
    ...details,
    currency: resolved,
    currency_resolution: { ...resolution, original },
    ...(lineItems ? { line_items: lineItems } : {}),
  };
}

export { receiptSummaryReconciles } from "./receipt-reconciliation";

export function hasCompleteReceiptCore(details: {
  merchant_raw: string | null; merchant_clean: string | null;
  transaction_date: string | null; total: number | null;
}) {
  const merchant = (details.merchant_clean || details.merchant_raw || "").trim();
  const date = details.transaction_date || "";
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null;
  return merchant.length > 1 && !/^(?:(?:test|official|sales|cash|store)\s+)?(?:receipt|invoice|total)$/i.test(merchant) &&
    !!parsed && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date &&
    typeof details.total === "number" && Number.isFinite(details.total) && details.total > 0;
}

/** Receipt validators score out of ten; cache routing compares percentages. */
export function receiptCacheQualityPercent(validation: { score?: unknown; issues?: unknown; critical?: unknown } | null) {
  if (!validation || validation.critical === true || (Array.isArray(validation.issues) && validation.issues.length)) return null;
  const score = validation.score;
  if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 100) return null;
  return score <= 10 ? score * 10 : score;
}
