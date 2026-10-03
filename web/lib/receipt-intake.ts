import { normalizeDefaultCurrency } from "./regional-preferences";

/** Classify the document, not a camera filename or incidental crypto substring. */
export function hasReceiptPhotoEvidence(text: string) {
  const source = text.normalize("NFKC");
  const receiptHeader = /\b(?:sales\s*invoice|official\s*receipt|sales\s*receipt|receipt\s*(?:no|number|#)|cashier|struk|kuitansi|kwitansi)\b|영수증|승인번호|領収書|收据|收據/iu.test(source);
  const settlement = /\b(?:grand\s*total|total(?:\s+(?:due|amount|payment))?|amount\s*due|subtotal|vat(?:able)?\s*(?:sales|amount)|payment\s*(?:type|method)|kembalian)\b|합\s*계|결제금액|받을금액/iu.test(source);
  const statementTable = /\b(?:opening|closing)\s+balance\b|\b(?:debit|withdrawal)\s+(?:credit|deposit)\s+balance\b|거래일자\s+입금\s+출금/iu.test(source);
  return receiptHeader && settlement && /\d/.test(source) && !statementTable;
}

type ReceiptCurrencyDetails = {
  currency: string | null;
  confidence_score: number;
  parser_evidence: { reason: string; source_text?: string | null; page?: number | null };
  currency_resolution?: { source?: string; original?: string | null; currency?: string; requiresReview?: boolean };
};

/** The user's default is a documented suggestion, never printed evidence. */
export function applyReceiptDefaultCurrency<T extends ReceiptCurrencyDetails>(details: T, defaultCurrency: string): T {
  const currency = details.currency?.trim().toUpperCase();
  const previousDefault = details.currency_resolution?.source === "user_default" &&
    details.currency_resolution.currency === currency;
  if (!previousDefault && currency && /^[A-Z]{3}$/.test(currency) && !["XXX", "MIXED"].includes(currency)) return details;
  const resolved = normalizeDefaultCurrency(defaultCurrency);
  return {
    ...details,
    currency: resolved,
    confidence_score: Math.min(details.confidence_score, details.confidence_score <= 1 ? .69 : 69),
    currency_resolution: { source: "user_default", original: previousDefault ? details.currency_resolution?.original ?? null : details.currency, currency: resolved, requiresReview: true },
    parser_evidence: { ...details.parser_evidence,
      reason: `${details.parser_evidence.reason.replace(/\s*Currency defaulted to [A-Z]{3} from the user's settings; editable in Transactions\./g, "")} Currency defaulted to ${resolved} from the user's settings; editable in Transactions.` },
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
