import { parseUnlocalizedReceiptText, readUnlocalizedReceiptInteger } from "./unlocalized-receipt";

type MoneyDetails = { total: number | null; parser_evidence: { source_text?: string | null; reason: string } };

/** Reuse the deterministic receipt grammar on the quoted model evidence.
 * Never infer a new amount from cash/change alone. Conflicting printed values
 * require another image read or an unresolved total, not silent arithmetic repair.
 */
export function assessReceiptCoreMoney<T extends MoneyDetails>(details: T) {
  const source = details.parser_evidence.source_text ?? "";
  const preview = parseUnlocalizedReceiptText(source);
  if (!preview) return { details, needsReread: false };
  const lines = source.normalize("NFKC").split(/\r?\n/).map(line => line.trim());
  const values = (label: RegExp) => [...new Set(lines.flatMap(line => {
    const match = line.match(label);
    if (!match) return [];
    const amount = readUnlocalizedReceiptInteger(match[1]!, true);
    return amount === null ? [] : [amount];
  }))];
  const cash = values(/^(?:tunai|cash(?:\s+(?:paid|tendered|received))?|uang\s+diterima)\s*[:.]?\s+(.+)$/iu);
  const change = values(/^(?:kembali(?:an)?|cg|change)\s*[:.]?\s+(.+)$/iu);
  const total = preview.total === null ? null : Number(preview.total);
  const conflicting = total === null || cash.length > 1 || change.length > 1 ||
    (cash.length === 1 && change.length === 1 && Math.abs(cash[0]! - change[0]! - total) > .001);
  return {
    details: { ...details, total: conflicting ? null : total,
      parser_evidence: { ...details.parser_evidence, reason: conflicting
        ? `${details.parser_evidence.reason} Printed total and payment evidence require review.`
        : total !== details.total ? `${details.parser_evidence.reason} Amount normalized from the printed integer total.`
        : details.parser_evidence.reason },
    },
    needsReread: conflicting,
  };
}

type MerchantDetails = {
  merchant_raw: string | null; merchant_clean: string | null;
  merchant_source_text?: string | null; merchant_source_kind?: string | null;
};
export function enforceReceiptCoreMerchantEvidence<T extends MerchantDetails>(details: T): T {
  const explicit = ["business_header", "business_logo", "business_footer"].includes(details.merchant_source_kind ?? "") &&
    Boolean(details.merchant_source_text?.trim());
  return explicit ? details : { ...details, merchant_raw: null, merchant_clean: null };
}
