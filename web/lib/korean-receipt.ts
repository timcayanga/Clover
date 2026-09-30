import type { ReceiptPreviewResult, ReceiptPreviewItem } from "@/lib/split-bill";
import { detectCurrencyEvidence } from "@/lib/financial-identity-detection";
import { hasHangul, normalizeKoreanFinancialText, parseKoreanAmount, parseKoreanDate } from "@/lib/korean-financial-text";

const compact = (value: string) => value.replace(/\s+/g, "");
const totals = /^(?:합계|총합계|총액|결제금액|총결제금액|받을금액|청구금액)[:：]?/;
const summary = /^(?:합계|총합계|총액|소계|결제금액|총결제금액|받을금액|청구금액|과세물품가액|과세금액|공급가액|면세금액|부가세|부가가치세|할인|현금|카드|신용|거스름|받은금액|봉사료|승인|거래번호|사업자|TEL|전화)/i;
const money = "[+-]?(?:₩\\s*)?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?(?:\\s*원)?";

/** Strict, evidence-backed core extraction. Unfamiliar layouts stay on the backup/review path. */
export function parseKoreanReceiptText(source: string): ReceiptPreviewResult | null {
  if (!hasHangul(source)) return null;
  const lines = normalizeKoreanFinancialText(source).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const labeledValues = (pattern: RegExp) => lines.flatMap((line, index) => {
    const normalizedLabel = line.replace(/([가-힣])\s+(?=[가-힣])/g, "$1").replace(/\s*[:：]\s*/g, ":");
    const label = normalizedLabel.match(pattern);
    if (!label) return [];
    const inline = normalizedLabel.slice(label[0].length).trim();
    const value = parseKoreanAmount(inline || lines[index + 1] || "");
    return value !== null ? [value] : [];
  });
  const totalCandidates = [...new Set(labeledValues(totals))];
  const total = totalCandidates.length === 1 && totalCandidates[0] > 0 ? totalCandidates[0] : null;
  const taxCandidates = labeledValues(/^(?:부가세|부가가치세)[:：]?/);
  const tax = taxCandidates.length === 1 ? taxCandidates[0] : null;
  const discount = labeledValues(/^(?:할인금액|할인액|할인)[:：]?/)[0] ?? null;
  const taxable = labeledValues(/^(?:과세물품가액|과세금액|공급가액)[:：]?/)[0] ?? null;
  const taxExempt = labeledValues(/^면세금액[:：]?/)[0] ?? 0;
  // 소계 often already includes VAT. Do not add the printed VAT twice.
  const subtotal = taxable !== null && tax !== null && total !== null && Math.abs(taxable + taxExempt + tax - total) < 0.01
    ? taxable + taxExempt : null;
  const currencyEvidence = detectCurrencyEvidence(source);
  const hasDomesticEvidence = /사업자\s*(?:등록)?\s*번호/.test(source) && /부\s*가\s*(?:가치)?\s*세/.test(source);
  const currency = currencyEvidence.currency ?? (hasDomesticEvidence && !currencyEvidence.ambiguous ? "KRW" : "MIXED");
  const currencyConflict = currencyEvidence.ambiguous || (currency !== "KRW" && currency !== "MIXED" && /₩|￦|\d[\d,]*\s*원/.test(source));
  const currencyWarning = currencyConflict ? "Multiple currencies: confirm the amount and settlement currency."
    : !currencyEvidence.currency ? (hasDomesticEvidence ? "KRW inferred from Korean receipt details. Confirm the currency." : "Currency is not shown. Select the receipt currency.") : null;
  const dates = lines.flatMap((line) => {
    const match = line.match(/\d{4}(?:\s*년\s*|[./-]\s*)\d{1,2}(?:\s*월\s*|[./-]\s*)\d{1,2}(?:\s*일)?/);
    const date = match ? parseKoreanDate(match[0]) : null;
    return date ? [date.toISOString().slice(0, 10)] : [];
  });
  const uniqueDates = [...new Set(dates)];
  const billDate = uniqueDates.length === 1 ? uniqueDates[0] : null;
  const merchantLine = lines.find((line) => /^(?:상호명?|매장명?|가맹점명)\s*[:：]/.test(line));
  const merchantName = merchantLine?.replace(/^(?:상호명?|매장명?|가맹점명)\s*[:：]\s*/, "").trim() || null;
  const items: ReceiptPreviewItem[] = [];
  const tableStart = lines.findIndex((line) => /상품명|품명/.test(line) && /수량/.test(line) && /금액/.test(line));
  if (tableStart >= 0) {
    for (const line of lines.slice(tableStart + 1)) {
      if (summary.test(compact(line))) break;
      const match = line.match(new RegExp(`^(.+?)\\s+(\\d+)\\s+(?:(${money})\\s+)?(${money})$`));
      if (!match || !hasHangul(match[1])) continue;
      const quantity = Number(match[2]);
      const unitPrice = match[3] ? parseKoreanAmount(match[3]) : null;
      const amount = parseKoreanAmount(match[4]);
      if (quantity <= 0 || amount === null || amount <= 0 || (total !== null && amount > total)) continue;
      if (unitPrice !== null && Math.abs(unitPrice * quantity - amount) > 0.01) continue;
      items.push({ description: match[1], quantity, unitPrice: unitPrice?.toFixed(2) ?? null, amount: amount.toFixed(2) });
    }
  }
  const cancelled = /(?:승인\s*취소|결제\s*취소|취소\s*영수증|환불\s*(?:금액|영수증))/.test(source);
  const itemSum = items.reduce((sum, item) => sum + Number(item.amount), 0);
  const reconciles = total !== null && items.length > 0 && Math.abs(itemSum - (discount ?? 0) - total) < 0.01;
  const requiresReview = cancelled || currencyWarning !== null || !merchantName || !billDate || total === null || !reconciles;
  return {
    receiptText: source, receiptType: "generic_receipt", merchantName, billDate,
    documentNumber: null, invoiceNumber: null, bookingReference: null,
    currency, currencyMentions: currency === "MIXED" ? [] : [currency], currencyWarning,
    paymentMethod: /카드\s*결제|신용\s*카드/.test(source) ? "Card" : /현금\s*(?:결제|영수증)/.test(source) ? "Cash" : null,
    receiptPayerName: null, subtotal: subtotal?.toFixed(2) ?? null, tax: tax?.toFixed(2) ?? null,
    serviceCharge: null, discount: discount?.toFixed(2) ?? null, tip: null, rounding: null,
    // A reversal must never take the purchase fast path as a positive expense.
    total: cancelled ? null : total?.toFixed(2) ?? null,
    items, participants: [], splitAllocations: [], receiptAccountMatch: null,
    confidence: requiresReview ? 45 : 92, requiresReview,
  };
}
