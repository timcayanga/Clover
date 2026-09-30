import type { ReceiptPreviewResult } from "@/lib/split-bill";
import { detectCurrencyEvidence } from "@/lib/financial-identity-detection";

const finalLabel = /^(?:grand\s*total|amount\s+due|due|du|tl)(?=\s|[:.]|$)\s*[:.]?\s*/i;
const totalLabel = /^total(?=\s|[:.]|$)\s*[.:]?\s*/i;
const integer = (text: string): number | null => {
  const token = text.replace(/^(?:Rp\.?|IDR)\s*/i, "").trim();
  if (!/^(?:[1-9]\d{0,2}(?:,\d{3})+|[1-9]\d{0,2}(?:\.\d{3})+|\d+)$/.test(token)) return null;
  const amount = Number(token.replace(/[.,]/g, ""));
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
};

/**
 * Summary-only safety path for integer-format receipts with no known
 * currency (or explicit rupiah). Never apply the generic cent-repair heuristic
 * to these documents. This is a review preview, not an inferred locale or item table.
 */
export function parseUnlocalizedReceiptText(source: string): ReceiptPreviewResult | null {
  const evidence = detectCurrencyEvidence(source);
  if (evidence.ambiguous || (evidence.currency && evidence.currency !== "IDR")) return null;
  const lines = source.normalize("NFKC").split(/\r?\n/).map(line => line.trim().replace(/^\*+/, "")).filter(Boolean);
  const amounts = source.match(/\b(?:\d{1,3}(?:[.,]\d{3})+|\d{4,})\b/g) ?? [];
  if (amounts.length < 2) return null;
  // Match whole numeric remainders, so "Total Item 5" and "Total Qty 16"
  // cannot become financial totals. Unknown embedded layout stays unresolved.
  const candidates = (label: RegExp) => lines.flatMap((line, index) => {
    const match = line.match(label);
    if (match) {
      const remainder = line.slice(match[0].length).trim();
      if (/^(?:item|qty|quantity)\b/i.test(remainder)) return [];
      return [integer(remainder || lines[index + 1] || "")];
    }
    const reversed = line.match(/^((?:Rp\.?\s*)?[\d.,]+)\s+(.+)$/i);
    return reversed && label.test(reversed[2]!) && reversed[2]!.replace(label, "").trim() === ""
      ? [integer(reversed[1]!)] : [];
  });
  const strong = candidates(finalLabel), ordinary = candidates(totalLabel);
  if (!strong.length && !ordinary.length) return null;
  const values = [...new Set(strong.length ? strong : ordinary)];
  const total = values.length === 1 ? values[0]! : null;
  const currency = evidence.currency ?? "MIXED";
  return {
    receiptText: source, receiptType: "generic_receipt", merchantName: null, billDate: null,
    documentNumber: null, invoiceNumber: null, bookingReference: null,
    currency, currencyMentions: currency === "MIXED" ? [] : [currency],
    currencyWarning: "Confirm the currency and integer amount formatting against the original receipt.",
    paymentMethod: null, receiptPayerName: null, subtotal: null, tax: null,
    serviceCharge: null, discount: null, tip: null, rounding: null,
    total: total?.toFixed(2) ?? null, items: [], participants: [], splitAllocations: [], receiptAccountMatch: null,
    confidence: 35, requiresReview: true,
  };
}
