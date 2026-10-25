import { normalizeReceiptCaptureLocation, locationMatchesReceiptDate } from "../../shared/receipt-capture-location";
import { getRegionalParsingProfile } from "./context-corpus";
import { normalizeDefaultCurrency } from "./regional-preferences";

/** Classify the document, not a camera filename or incidental crypto substring. */
export function hasReceiptPhotoEvidence(text: string) {
  const source = text.normalize("NFKC");
  const receiptHeader = /\b(?:sales\s*invoice|inv(?:oice)?\.?\s*(?:no\.?|number|#)\s*:?|official\s*receipt|sales\s*receipt|receipt\s*(?:no|number|#)|cashier|struk|kuitansi|kwitansi)\b|영수증|승인번호|領収書|收据|收據/iu.test(source) || /(?:^|\n)\s*(?:receipt|invoice|expense\s+record)\s*(?:\n|$)/iu.test(source);
  const settlement = /\b(?:grand\s*total|total(?:\s+(?:due|amount|payment))?|amount\s*due|subtotal|vat(?:able)?\s*(?:sales|amount)|payment\s*(?:type|method)|kembalian)\b|합\s*계|결제금액|받을금액/iu.test(source);
  const statementTable = /\b(?:transaction\s+history|account\s+activity|past\s+transactions|recent\s+transactions)\b|\b(?:opening|closing|starting|ending)\s+balance\b|\b(?:debit|withdrawal)\s+(?:credit|deposit)\s+balance\b|거래일자\s+입금\s+출금/iu.test(source);
  const printedPaidTotal = /^\s*total\s+paid\s*[:.]?\s*(?:(?:PHP|USD|EUR|GBP|SGD|MYR|IDR|₱|\$|€|£)\s*)\d[\d,]*\.\d{2}\s*$/imu.test(source);
  return (receiptHeader || printedPaidTotal) && settlement && /\d/.test(source) && !statementTable;
}

type ReceiptCurrencyDetails = {
  currency: string | null;
  transaction_date?: string | null;
  confidence_score: number;
  parser_evidence: { reason: string; source_text?: string | null; page?: number | null };
  currency_resolution?: { source?: string; original?: string | null; currency?: string; requiresReview?: boolean; evidence?: string; confidence?: number; countryCode?: string };
};

/** Strong printed location clues suggest a currency, never rewrite source text.
 * Conflicting regions deliberately fall back to the user's preference. */
function receiptLocationCandidates(text: string) {
  const source = text.normalize("NFKC");
  const regions: [string, RegExp][] = [
    ["PHP", /\bPhilippines\b|\b(?:Makati|Mandaluyong|Taguig|Pasig|Quezon|Cebu|Davao)\s+City\b|\bBIR\b.{0,50}\b(?:permit|accred|TIN)\b/i],
    ["IDR", /\bIndonesia\b|\b(?:Jakarta|Surabaya|Bandung|Denpasar)\b.{0,60}\b\d{5}\b/i],
    ["KRW", /\b(?:South Korea|Republic of Korea)\b|(?:서울|부산|인천|대구|대전|광주|울산)(?:특별시|광역시)|대한민국/u],
    ["SGD", /\bSingapore\s+\d{6}\b/i],
    ["MYR", /\bMalaysia\b/i], ["THB", /\bThailand\b/i],
    ["VND", /\bViet\s*Nam\b/i], ["JPY", /\bJapan\b|日本国/u],
    ["HKD", /\bHong Kong\b/i], ["AUD", /\bAustralia\b/i],
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

/** The user's default is a documented suggestion, never printed evidence. */
export function applyReceiptDefaultCurrency<T extends ReceiptCurrencyDetails>(details: T, defaultCurrency: string, receiptText = "", captureLocation?: unknown): T {
  const currency = details.currency?.trim().toUpperCase();
  const previousDefault = ["user_default", "device_location"].includes(details.currency_resolution?.source ?? "") &&
    details.currency_resolution?.currency === currency;
  if (!previousDefault && currency && /^[A-Z]{3}$/.test(currency) && !["XXX", "MIXED"].includes(currency)) return details;
  const locations = receiptLocationCandidates([receiptText, details.parser_evidence.source_text].filter(Boolean).join("\n"));
  const location = locations.length === 1 ? locations[0] : null;
  const hint = normalizeReceiptCaptureLocation(captureLocation);
  const deviceCurrency = locations.length === 0 && hint && locationMatchesReceiptDate(hint, details.transaction_date)
    ? getRegionalParsingProfile(hint.countryCode)?.defaultCurrency : null;
  const useDevice = !location && !!deviceCurrency;
  const resolved = location?.currency ?? deviceCurrency ?? normalizeDefaultCurrency(defaultCurrency);
  return {
    ...details,
    currency: resolved,
    currency_resolution: { source: location ? "receipt_location" : useDevice ? "device_location" : "user_default", original: previousDefault ? details.currency_resolution?.original ?? null : details.currency, currency: resolved, requiresReview: false, ...(location ? { evidence: location.evidence } : useDevice ? { evidence: `Optional capture country: ${hint!.countryCode}`, countryCode: hint!.countryCode, confidence: 0.7 } : {}) },
    parser_evidence: { ...details.parser_evidence,
      reason: `${details.parser_evidence.reason.replace(/\s*Currency (?:defaulted to [A-Z]{3} from the user's settings|suggested as [A-Z]{3} from optional capture country [A-Z]{2}); editable in Transactions\./g, "")} ${location ? `Currency suggested as ${resolved} from printed location: ${location.evidence}; editable in Transactions.` : useDevice ? `Currency suggested as ${resolved} from optional capture country ${hint!.countryCode}; editable in Transactions.` : `Currency defaulted to ${resolved} from the user's settings; editable in Transactions.`}` },
  };
}

/** Subtotal may already include tax. Accept either arithmetic, never change digits. */
export function receiptSummaryReconciles(details: {
  subtotal: number | null; total: number | null; tax: number | null;
  service_charge: number | null; tip: number | null; discount: number | null;
}) {
  if (details.subtotal === null || details.total === null) return true;
  const adjustments = (details.service_charge ?? 0) + (details.tip ?? 0) - (details.discount ?? 0);
  return [details.subtotal + adjustments, details.subtotal + (details.tax ?? 0) + adjustments]
    .some(total => Number.isFinite(total) && Math.abs(total - details.total!) <= .1);
}

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
