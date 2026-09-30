type ReceiptCurrencyCandidate = {
  currency: string | null;
  currency_source_text?: string | null;
  confidence_score: number;
  parser_evidence: { page?: number | null; source_text?: string | null; reason: string };
};

export function hasRegionalReceiptCurrencyEvidence(currency: string | null, text: string) {
  if (currency === "KRW") return /\bKRW\b|[₩￦]|\d[\d,.\s]*원(?=$|[\s).,])/iu.test(text);
  if (currency === "IDR") return /\b(?:IDR|rupiah)\b|\bRp\.?\s*(?:\d|$)/iu.test(text);
  return true;
}

// Model confidence is not proof of a currency. Enforce the regional evidence
// contract before creating rows; the unmodified model response stays in audit.
export function enforceRegionalReceiptCurrencyEvidence<T extends ReceiptCurrencyCandidate>(details: T): T {
  const evidence = [details.currency_source_text, details.parser_evidence.source_text].filter(Boolean).join("\n");
  if (hasRegionalReceiptCurrencyEvidence(details.currency, evidence)) return details;
  return { ...details, currency: null,
    confidence_score: Math.min(details.confidence_score, details.confidence_score <= 1 ? .5 : 50),
    parser_evidence: { ...details.parser_evidence,
      reason: `${details.parser_evidence.reason} Currency requires review: no quoted currency evidence.` },
  };
}
