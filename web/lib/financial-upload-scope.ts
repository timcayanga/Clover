import { findReceiptImageRegion } from "./receipt-image-region";
import { classifyBlankPurchaseTemplate } from "./blank-purchase-template";
import { inspectBankingScreenshot } from "./banking-screenshot-evidence";
import { hasLocalizedReceiptEvidence } from "./localized-receipt-cues";
import { readReceiptOpticalLayout } from "./local-receipt-ocr-envelope";
import { classifyUnsettledPurchaseDocument } from "./purchase-document-payment";
import { splitReceiptPromotionalFooter } from "./receipt-promotional-footer";
import { hasKoreanFinancialHeaders, normalizeKoreanFinancialText } from "@/lib/korean-financial-text";
import { hasIndonesianFinancialHeaders, hasIndonesianFinancialText, hasRupiahMarker } from "@/lib/indonesian-financial-text";
import { parseHeldNativeSource } from "@/lib/held-source-contracts";
import { hasReceiptPhotoEvidence } from "@/lib/receipt-intake";
import { isUploadPhoto } from "../../shared/native-upload";

export type FinancialUploadScopeDecision = {
  decision: "financial" | "ambiguous" | "non_financial";
  confidence: number;
  reasons: string[];
  kind?: "promotion" | "general_document" | "pre_purchase" | "banking_screen";
  reasonCode?: RejectionReasonCode;
  ruleId?: string;
};

export const NON_FINANCIAL_UPLOAD_MESSAGE =
  "This does not look like a financial record Clover can import. Try a receipt, statement, invoice, transaction screenshot, portfolio record, or financial note instead.";
export const PROMOTIONAL_UPLOAD_MESSAGE =
  "This looks like a coupon, voucher, or promotion rather than proof of a completed purchase. Try uploading the full receipt showing the purchase date and total amount.";

export const BANKING_SCREEN_UPLOAD_MESSAGE =
  "This screen does not show enough transaction details. Upload the activity list or open a completed transaction and capture its details.";

export const PRE_PURCHASE_UPLOAD_MESSAGE =
  "This looks like a menu, price list, or shopping cart. Upload the receipt or payment confirmation after the purchase.";

const rejectionDetails = {
  "I-108-PROMOTION": { reason: "This looks like a standalone coupon, voucher, or promotion.", nextAction: "Upload the full receipt showing the purchase date and total." },
  "I-108-CART": { reason: "This shows a shopping cart or checkout.", nextAction: "After paying, upload the receipt or payment confirmation." },
  "I-108-CATALOG": { reason: "This shows a menu, price list, or catalog.", nextAction: "Upload the receipt showing what you purchased." },
  "I-108-BANKING-SCREEN": { reason: "This banking screen does not show enough transaction details.", nextAction: "Upload the activity list or open a completed transaction and capture its details." },
  "I-108-RESUME": { reason: "This looks like a résumé or CV.", nextAction: "Upload the financial document you meant to import." },
  "I-108-MEETING": { reason: "This looks like a meeting agenda or minutes.", nextAction: "Upload the receipt, statement, or financial record for the expense." },
  "I-108-TEMPLATE": { reason: "This itinerary template contains example amounts.", nextAction: "Upload a receipt or booking confirmation showing the actual payment." },
  "I-108-GENERAL": { reason: "Clover could not identify a financial record in this file.", nextAction: "Upload a receipt, statement, invoice, transaction screenshot, portfolio record, or financial note." },
} as const;
type RejectionReasonCode = keyof typeof rejectionDetails;

export class NonFinancialUploadError extends Error {
  constructor(readonly reasonCode: RejectionReasonCode, readonly ruleId = "general_document_scope") {
    const { reason, nextAction } = rejectionDetails[reasonCode];
    super(`${reason} ${nextAction} (${reasonCode})`);
  }
}

export function getUploadRejectionDetails(error: unknown) {
  if (error instanceof NonFinancialUploadError) {
    return { reasonCode: error.reasonCode, ruleId: error.ruleId, ...rejectionDetails[error.reasonCode] };
  }
  return { reasonCode: "I-108-GENERAL", ...rejectionDetails["I-108-GENERAL"] };
}

const PRE_PURCHASE_CATALOG_TITLE = /^(?:(?:[\p{L}\p{N}&’' .-]{1,45})\s+)?(?:menu|price\s*list|product\s*catalog(?:ue)?)\s*[:.!-]?$/iu;
const PRE_PURCHASE_CART_TITLE = /^(?:your cart|my cart|shopping (?:cart|bag)|cart|basket|checkout)\s*[:.!-]?$/i;
const CHECKOUT_ACTION = /^(?:proceed to checkout|continue to (?:checkout|payment)|place order|pay now|remove item|add to cart|sign in to check out)\b/i;
const CATALOG_PRICE = /^[\p{L}][^\n]{1,95}\s+(?:(?:PHP|USD|EUR|GBP|₱|\$|€|£)\s*\d[\d,.]*|\d[\d,]*\.\d{2})\s*$/iu;
const SALE_SETTLEMENT = /^(?:(?:total paid|amount paid|cash tendered|cash received|change due|change)\s*[:：]?\s*(?:(?:[A-Z]{3}|₱|\$|€|£|P)\s*)?\d[\d,.]*(?:\s+(?:PHP|USD|EUR|GBP))?\s*$|(?:payment\s+(?:approved|successful|completed)|approved|paid in full)\s*[.!]?$|(?:approval|authorization|auth)\s*(?:code|no\.?|#)\s*[:：]?\s*[A-Z0-9]*\d[A-Z0-9]*|(?:receipt\s*(?:no\.?|number|#))\s*[:：#]?\s*[A-Z0-9-]*\d[A-Z0-9-]*)/i;
const FINANCIAL_RECORD_LINE = /^(?:official receipt|sales invoice|tax invoice|statement of account|transaction history|opening balance|closing balance)\b/i;

function assessPrePurchasePhoto(text: string): FinancialUploadScopeDecision | null {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const header = lines.slice(0, 3);
  const cart = header.some(line => PRE_PURCHASE_CART_TITLE.test(line));
  const catalog = header.some(line => PRE_PURCHASE_CATALOG_TITLE.test(line));
  if (!cart && !catalog) return null;
  const hasSettlement = lines.some(line => SALE_SETTLEMENT.test(line));
  const hasReceiptHeading = lines.some(line => /^receipt$/i.test(line));
  const hasReceiptTotal = lines.some(line =>
    /^(?:grand total|total(?: amount)?)\s*[:：]?\s*(?:[A-Z]{3}\s*|[₱$€£]\s*)?\d[\d,.]*$/i.test(line));
  const hasDocument = lines.some(line => FINANCIAL_RECORD_LINE.test(line)) ||
    (hasReceiptHeading && hasReceiptTotal) || hasLocalizedReceiptEvidence(text);
  if (hasSettlement || hasDocument) {
    return { decision: "financial", confidence: 84,
      reasons: ["settlement or issued document evidence alongside pre-purchase wording"] };
  }
  const checkoutAction = cart && lines.some(line => CHECKOUT_ACTION.test(line));
  const prices = catalog && lines.filter(line => CATALOG_PRICE.test(line)).length >= 2;
  if (checkoutAction || prices) {
    return { decision: "non_financial", confidence: 96, kind: "pre_purchase",
      reasonCode: checkoutAction ? "I-108-CART" : "I-108-CATALOG",
      ruleId: checkoutAction ? "cart_heading_and_checkout_action" : "catalog_heading_and_prices",
      reasons: [checkoutAction ? "cart heading and checkout action" : "menu or price-list heading and listed prices"] };
  }
  return { decision: "ambiguous", confidence: 0, reasons: ["pre-purchase wording without decisive document evidence"] };
}

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

// These patterns identify a document's purpose. A lone word, a generic
// filename, or the absence of readable financial fields cannot prove it.
const PHOTO_PROMOTION_TITLE = /^(?:(?:[^.!?\n]{0,55}\b)?(?:coupon|(?:gift\s+)?voucher|discount code|special offer|advertisement|kupon|kode promo)\b|(?:할인\s*)?쿠폰(?:\s|[:：]|$))/i;
const PHOTO_PROMOTION_TERMS = /\b(?:redeem(?:able)?|valid until|expires?|terms apply|offer ends|promo code|next (?:order|purchase|visit)|hanya berlaku|berlaku hingga|berlaku(?=\s+\d{1,2}[/-]\d{1,2}[/-]\d{2,4}))\b|사용\s*기한|유효\s*기간|다음\s*(?:구매|방문)/i;
const PHOTO_RESUME_TITLE = /^(?:curriculum vitae|résumé|resume)\b/i;
const PHOTO_RESUME_SECTION = /\b(?:professional experience|employment history|work experience|education and qualifications|career objective)\b/i;
const PHOTO_MEETING_TITLE = /^(?:meeting agenda|meeting minutes)\b/i;
const PHOTO_MEETING_SECTION = /\b(?:attendees|action items|team responsibilities|agenda items)\b/i;
const PHOTO_ITINERARY_TEMPLATE = /\bitinerary template\b/i;
const PHOTO_ITINERARY_PLACEHOLDER = /\b(?:destination\s*[ab]|site\s*1|tap enter to add more sites|example expenses)\b/i;
const PHOTO_PARTIAL_FINANCIAL_EVIDENCE = /\b(?:receipt|invoice|statement|settlement|cashier|tendered|total paid|amount payable|transaction history|opening balance|closing balance)\b|영수증|결제금액|거래내역|領収書|收据|收據|ใบเสร็จ|\b(?:struk|kuitansi|kwitansi)\b/iu;

function affirmativePhotoRejection(text: string, hasContraryEvidence: boolean): FinancialUploadScopeDecision | null {
  if (hasContraryEvidence) return null;
  const title = text.split(/\r?\n/, 1)[0]?.trim() ?? "";
  if (PHOTO_PROMOTION_TITLE.test(title) && PHOTO_PROMOTION_TERMS.test(text)) {
    return { decision: "non_financial", confidence: 96, kind: "promotion", reasonCode: "I-108-PROMOTION", ruleId: "promotion_heading_and_redemption_terms",
      reasons: ["promotion title and redemption terms"] };
  }
  if (PHOTO_RESUME_TITLE.test(title) && PHOTO_RESUME_SECTION.test(text)) {
    return { decision: "non_financial", confidence: 96, kind: "general_document",
      reasonCode: "I-108-RESUME", ruleId: "resume_heading_and_sections", reasons: ["résumé title and employment or education section"] };
  }
  if (PHOTO_MEETING_TITLE.test(title) && PHOTO_MEETING_SECTION.test(text)) {
    return { decision: "non_financial", confidence: 96, kind: "general_document",
      reasonCode: "I-108-MEETING", ruleId: "meeting_heading_and_sections", reasons: ["meeting agenda or minutes title and meeting content"] };
  }
  if (PHOTO_ITINERARY_TEMPLATE.test(text) && PHOTO_ITINERARY_PLACEHOLDER.test(text)) {
    return { decision: "non_financial", confidence: 96, kind: "general_document",
      reasonCode: "I-108-TEMPLATE", ruleId: "itinerary_template_and_placeholders", reasons: ["itinerary template title and placeholder content"] };
  }
  return null;
}

export const assessFinancialUploadScope = (params: {
  text?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  parsedRowsCount?: number;
  metadataConfidence?: number | null;
  hasInstitution?: boolean;
}): FinancialUploadScopeDecision => {
  // A merchant's voucher label is not a promotion-only document when the
  // complete native bank ledger independently proves every movement. Row
  // counts, institution guesses and proof markers alone cannot qualify.
  if (/^SEABANK_ID_NATIVE_PAGES \d+$/m.test(params.text ?? "")) {
    try {
      const native = parseHeldNativeSource(params.text ?? "");
      if (native?.rows.length && native.rows.every(row => ["seabank_indonesia_native", "seabank_indonesia_legacy_daily"].includes(String(row.rawPayload?.source)))) {
        return { decision: "financial", confidence: 95, reasons: ["complete reconciled native Indonesian SeaBank ledger"] };
      }
    } catch { /* Incomplete proofs retain the ordinary scope/review guards. */ }
  }
  const fileName = params.fileName ?? "";
  const image = isUploadPhoto(fileName, params.fileType);
  const input = params.text ?? "";
  const region = image ? findReceiptImageRegion(input) : null;
  const sourceText = normalizeKoreanFinancialText(region?.text ?? readReceiptOpticalLayout(input)).trim();
  const { body, footer } = image ? splitReceiptPromotionalFooter(sourceText) : { body: sourceText, footer: null };
  const bankingEvidence = image ? inspectBankingScreenshot(body) : null;
  const bankingScreen = bankingEvidence?.kind;
  if (bankingScreen === "screen_only") {
    return { decision: "non_financial", confidence: 94, kind: "banking_screen", reasonCode: "I-108-BANKING-SCREEN", ruleId: "banking_navigation_or_banner_only",
      reasons: ["banking navigation or completion banner without transaction records"] };
  }
  if (bankingScreen === "history" || bankingScreen === "detail" || bankingScreen === "unsettled_detail") {
    return { decision: "financial", confidence: 88, reasons: [bankingScreen === "history"
      ? "dated banking activity with multiple transaction amounts"
      : bankingScreen === "detail" ? "banking transaction details with a dated amount and reference"
      : bankingEvidence?.review?.status ?? "banking transaction status without settled movement"] };
  }
  const blankTemplate = classifyBlankPurchaseTemplate(body);
  if (blankTemplate) return { decision: "financial", confidence: 95, reasons: [blankTemplate] };
  const purchaseDocument = classifyUnsettledPurchaseDocument(body);
  if (purchaseDocument) {
    return { decision: "financial", confidence: purchaseDocument === "unverified_invoice" ? 70 : 95, reasons: [purchaseDocument] };
  }
  const text = body.replace(/\s+/g, " ");
  const reasons: string[] = [];
  const hasAmount = AMOUNT_SIGNAL.test(text) || /(?:₩\s*\d[\d,]*|\d[\d,]*\s*원|(?:합계|결제금액|입금|출금|잔액|평가금액|매입금액|현재가)\s*[:：]?\s*\d[\d,]*)/.test(text);
  const hasDate = DATE_SIGNAL.test(text) || /\d{4}\s*(?:년|\.)\s*\d{1,2}\s*(?:월|\.)\s*\d{1,2}/.test(text);
  const hasCurrency = CURRENCY_SIGNAL.test(text) || hasRupiahMarker(text);
  const looksPromotional = PROMOTIONAL_WORDS.test(text) || /쿠폰|할인코드|프로모션|메뉴판/.test(text) || /\b(?:kupon|kode promo|daftar harga|diskon hingga)\b/i.test(text);
  // A real receipt can carry an offer below its purchase details, and blur
  // may leave only the header/settlement labels readable. Neither is enough
  // to save a transaction, but it is enough to avoid rejecting the photo.
  if (image) {
    // Cart estimates can resemble ledger rows. Classify the visible source
    // before inferred metadata, tax, or totals can imply a completed sale.
    const prePurchase = assessPrePurchasePhoto(body);
    if (prePurchase) return prePurchase;
  }
  const hasReceiptStructure = /\b(?:(?:official|sales|cash)\s+receipt|(?:sales|tax|commercial)\s+invoice)\b/i.test(text) &&
    /\b(?:total|subtotal|amount\s+due|cashier|payment\s+(?:type|method))\b/i.test(text);
  const hasLocalizedPurchase = hasLocalizedReceiptEvidence(body);
  const hasCorroboratedReceipt =
    hasReceiptPhotoEvidence(body) &&
    (hasAmount || hasDate || hasLocalizedPurchase);
  const hasCompletedPurchaseEvidence = hasLocalizedPurchase || hasReceiptStructure || hasCorroboratedReceipt || COMPLETED_PURCHASE_WORDS.test(text) || /영수증|결제금액|승인번호|거래번호/.test(text) || /\b(?:struk|kuitansi|kwitansi|no\.? struk|sudah dibayar|pembayaran berhasil|kembalian)\b/i.test(text);
  const financialWordCount = countMatches(
    text.toLowerCase(),
    /\b(?:account|amount|balance|bank|billing|cash|credit|currency|debit|deposit|due|fee|invoice|merchant|paid|payment|purchase|receipt|statement|subtotal|tax|total|transaction|transfer|withdrawal)\b/g
  );
  const investmentWordCount = countMatches(
    text.toLowerCase(),
    /\b(?:asset|broker|dividend|fund|holding|investment|maturity|principal|security|shares?|stock|units?)\b/g
  );

  if (hasLocalizedPurchase) reasons.push("localized receipt or payment status with a printed monetary amount");
  else if (hasCorroboratedReceipt) reasons.push("receipt with purchase evidence");
  if (!image && (params.parsedRowsCount ?? 0) > 0) reasons.push("deterministic financial rows");
  if (!image && (params.metadataConfidence ?? 0) >= 75) reasons.push("high-confidence financial metadata");
  if (!image && params.hasInstitution && (hasAmount || hasDate || financialWordCount > 0 || investmentWordCount > 0)) {
    reasons.push("financial institution with document evidence");
  }
  if (FINANCIAL_HEADERS.test(text) || hasKoreanFinancialHeaders(body)) reasons.push("financial table headers");
  if (body.split(/\r?\n/).some(line => hasIndonesianFinancialHeaders(line.split(/[;,|\t]/)))) reasons.push("Indonesian financial table headers");
  if (hasIndonesianFinancialText(text) && /\d/.test(text) && (hasAmount || hasCurrency || hasDate)) reasons.push("Indonesian financial labels and values");
  if (hasAmount && /영수증|합\s*계|부가세|거래내역|계좌|입금|출금|잔액|평가금액|보유수량/.test(text)) reasons.push("Korean financial labels and values");
  if (hasCurrency && (hasAmount || hasDate)) reasons.push("currency and amount/date evidence");
  if (financialWordCount >= 2 && (hasAmount || hasDate)) reasons.push("financial vocabulary with values");
  if (investmentWordCount >= 2 && (hasAmount || hasDate || hasCurrency)) reasons.push("investment vocabulary with values");
  if (!image && FINANCIAL_FILE_NAME.test(fileName) && (hasAmount || hasDate || financialWordCount > 0 || investmentWordCount > 0)) reasons.push("financial filename with document evidence");
  if (!image && STRUCTURED_FINANCIAL_FILE.test(fileName) && (FINANCIAL_HEADERS.test(text) || hasAmount)) reasons.push("structured financial data");

  // Coupons and promotional cards often contain prices, expiry dates, and a
  // merchant name. Reject them only when they lack evidence that money
  // actually changed hands, so a receipt carrying a coupon line still passes.
  if (image) {
    const contraryEvidence = Boolean(footer) || hasCompletedPurchaseEvidence ||
      PHOTO_PARTIAL_FINANCIAL_EVIDENCE.test(text) ||
      FINANCIAL_HEADERS.test(text) ||
      hasKoreanFinancialHeaders(body);
    const rejection = affirmativePhotoRejection(sourceText, contraryEvidence);
    if (rejection) return rejection;
  } else if (looksPromotional && !hasCompletedPurchaseEvidence && !FINANCIAL_HEADERS.test(text)) {
    return {
      decision: "non_financial",
      confidence: 96,
      reasons: ["promotion without completed purchase evidence"],
      kind: "promotion", reasonCode: "I-108-PROMOTION", ruleId: "promotion_without_purchase_evidence",
    };
  }

  if (reasons.length > 0) {
    return { decision: "financial", confidence: Math.min(99, 68 + reasons.length * 8), reasons };
  }

  if (image) {
    return { decision: "ambiguous", confidence: 0, reasons: ["no decisive evidence in photo text"] };
  }

  // Keep the legacy non-image document heuristics scoped to other formats.
  if (text.length < 160) {
    return { decision: "ambiguous", confidence: 0, reasons: ["insufficient local text for a safe rejection"] };
  }

  const digitRatio = (text.match(/\d/g)?.length ?? 0) / Math.max(1, text.length);
  const strongNegative = NON_FINANCIAL_WORDS.test(text) && !FINANCIAL_HEADERS.test(text) && !(hasCurrency && hasAmount);
  const hasUnreadableFinancialEvidence = hasReceiptStructure || financialWordCount >= 2 || investmentWordCount >= 2 ||
    hasIndonesianFinancialText(text) || /영수증|결제금액|거래내역|계좌|입금|출금|잔액|평가금액|보유수량/.test(text);
  if (strongNegative || (text.length >= 320 && digitRatio < 0.015 && !DATE_SIGNAL.test(text) && !AMOUNT_SIGNAL.test(text) && !hasUnreadableFinancialEvidence)) {
    return {
      decision: "non_financial",
      confidence: strongNegative ? 96 : 88,
      reasons: [strongNegative ? "non-financial document vocabulary" : "long prose without financial values or structure"],
      kind: "general_document",
      ruleId: strongNegative ? "non_financial_document_vocabulary" : "non_financial_long_prose",
    };
  }

  return { decision: "ambiguous", confidence: 0, reasons: ["local evidence is inconclusive"] };
};

/** Only affirmative image rules can stop extraction before further reading. */
export function getClearLocalPhotoRejection(params: Parameters<typeof assessFinancialUploadScope>[0]) {
  if (!params.text?.trim() || !isUploadPhoto(params.fileName ?? "", params.fileType)) return null;
  const scope = assessFinancialUploadScope(params);
  return scope.decision === "non_financial" && scope.reasonCode && scope.ruleId
    ? new NonFinancialUploadError(scope.reasonCode, scope.ruleId) : null;
}

export const getNonFinancialUploadMessage = (decision: FinancialUploadScopeDecision) =>
  decision.kind === "banking_screen" ? BANKING_SCREEN_UPLOAD_MESSAGE
    : decision.kind === "pre_purchase" ? PRE_PURCHASE_UPLOAD_MESSAGE
    : decision.kind === "promotion" ? PROMOTIONAL_UPLOAD_MESSAGE : NON_FINANCIAL_UPLOAD_MESSAGE;

export const isNonFinancialUploadError = (value: unknown) => {
  if (value instanceof NonFinancialUploadError) return true;
  const message = value instanceof Error ? value.message : String(value ?? "");
  return message.includes(BANKING_SCREEN_UPLOAD_MESSAGE) || message.includes(NON_FINANCIAL_UPLOAD_MESSAGE) || message.includes(PROMOTIONAL_UPLOAD_MESSAGE) || message.includes(PRE_PURCHASE_UPLOAD_MESSAGE);
};
