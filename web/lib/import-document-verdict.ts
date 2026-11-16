import { hasLocalizedReceiptEvidence } from "./localized-receipt-cues";

export const IMPORT_DOCUMENT_TYPES = ["statement", "receipt", "notes", "portfolio", "account_detail"] as const;
type DocumentType = (typeof IMPORT_DOCUMENT_TYPES)[number];
export type ImportDocumentVerdict =
  | { documentType: DocumentType; evidence: string[] }
  | { documentType: "uncertain"; evidence: [] };

const documentPatterns: Record<DocumentType, RegExp> = {
  statement: /\b(?:statement of account|(?:account|bank|credit card) statement|transaction history|account activity|opening balance|(?:debit|withdrawal)\s+(?:credit|deposit)\s+balance)\b|거래\s*내역|mutasi rekening|riwayat transaksi|交易明細/iu,
  receipt: /^(?:(?:official|sales|cash|purchase)\s+)?receipt(?:\s+(?:no\.?|number|#)\s*[:#]?\s*[\w-]+)?$|\b(?:total paid|cash tendered|payment (?:successful|approved)|sales invoice)\b|領収書|收據|ใบเสร็จ|영수증|biên lai|resibo|struk/imu,
  notes: /\b(?:expense (?:log|record|notes)|spending (?:log|notes)|split bill|shared expenses)\b/iu,
  portfolio: /\b(?:portfolio|holdings|market value|unrealized (?:gain|loss)|asset allocation)\b|보유수량|평가금액/iu,
  account_detail: /\b(?:account details|account number|available balance|current balance|account balance|maturity date)\b|saldo tersedia|출금가능금액/iu,
};

const normalize = (text: string) => text.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();

export function verifyImportDocumentVerdict(
  verdict: { document_type: DocumentType | "uncertain"; visible_evidence: string[] } | null | undefined,
  declaredType: DocumentType,
  source: string,
): ImportDocumentVerdict {
  if (!verdict || verdict.document_type === "uncertain" || verdict.document_type !== declaredType) {
    return { documentType: "uncertain", evidence: [] };
  }
  const normalizedSource = normalize(source);
  const evidence = [...new Set(verdict.visible_evidence.map(quote => quote.trim()))];
  const grounded = evidence.length > 0 && evidence.every(quote => quote.length >= 3 && normalizedSource.includes(normalize(quote)));
  const evidenceText = evidence.join("\n");
  if (!grounded || (!documentPatterns[declaredType].test(evidenceText) &&
      !(declaredType === "receipt" && hasLocalizedReceiptEvidence(evidenceText)))) {
    return { documentType: "uncertain", evidence: [] };
  }
  return { documentType: declaredType, evidence };
}

export function resolveImportDocumentDisagreement(
  local: ImportDocumentVerdict["documentType"],
  backup: ImportDocumentVerdict["documentType"],
  verifiedTypes: readonly DocumentType[],
): "use_backup" | "use_local" | "review" {
  if (local === "uncertain" || backup === "uncertain" || local === backup) return "use_backup";
  if (verifiedTypes.length !== 1) return "review";
  if (verifiedTypes[0] === local) return "use_local";
  return verifiedTypes[0] === backup ? "use_backup" : "review";
}
