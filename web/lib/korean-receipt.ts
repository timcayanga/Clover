import type { ReceiptPreviewResult, ReceiptPreviewItem } from "@/lib/split-bill";
import { detectCurrencyEvidence } from "@/lib/financial-identity-detection";
import { hasHangul, normalizeKoreanFinancialText, parseKoreanAmount, parseKoreanDate } from "@/lib/korean-financial-text";

const compact = (value: string) => value.replace(/\s+/g, "");
const totals = /^(?:총결제금액|실결제금액|결제금액|총합계|합계금액|합계|총액|받을금액|청구금액)[:：]?/;
const summary = /^(?:합계|총합계|총액|소계|결제금액|총결제금액|실결제금액|받을금액|청구금액|과세물품가액|과세금액|공급가액|면세물품가액|면세금액|부가세|부가가치세|할인|현금|카드|신용|거스름|받은금액|봉사료|승인|거래번호|사업자|TEL|전화)/i;
const money = "[+-]?(?:₩\\s*)?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?(?:\\s*원)?";
const merchantLabel = /^(?:상호명?|매장명?|가맹점명)\s*(?:[:：]\s*|\s+|$)/;

type ReceiptColumn = "description" | "quantity" | "unitPrice" | "amount";
const columnLabels: Record<string, ReceiptColumn> = {
  상품명: "description", 품명: "description", 메뉴명: "description", 수량: "quantity", 단가: "unitPrice", 금액: "amount", 판매금액: "amount",
};

function receiptColumns(line: string): ReceiptColumn[] | null {
  const headerRemainder = line.replace(/상품명|메뉴명|품명|판매금액|수량|단가|금액/g, "").replace(/[\s|:/(),원₩-]/g, "");
  if (headerRemainder) return null;
  const columns = [...line.matchAll(/상품명|메뉴명|품명|판매금액|수량|단가|금액/g)].map(match => columnLabels[match[0]]!);
  if (columns[0] !== "description" || !columns.includes("quantity") || !columns.includes("amount") ||
      new Set(columns).size !== columns.length) return null;
  return columns;
}

function parseItems(lines: string[], total: number | null) {
  const items: ReceiptPreviewItem[] = [];
  const tableStart = lines.findIndex(line => receiptColumns(line));
  if (tableStart < 0) return { items, complete: false };
  const columns = receiptColumns(lines[tableStart]!)!;
  // Numeric columns follow the actual printed header, not a guessed order.
  const numericPattern = columns.slice(1).map(column => column === "quantity" ? "(\\d+(?:\\.\\d+)?)" : `(${money})`).join("\\s+");
  const rowPattern = new RegExp(`^(.+?)\\s+${numericPattern}$`);
  const numericOnly = new RegExp(`^${numericPattern}$`);
  let pendingName = "", incomplete = false;
  for (const line of lines.slice(tableStart + 1)) {
    if (summary.test(compact(line))) break;
    if (/^[-=_*\s]+$/.test(line) || receiptColumns(line)) continue;
    const direct = line.match(rowPattern);
    const wrapped = !direct && pendingName ? line.match(numericOnly) : null;
    const name = direct ? `${pendingName} ${direct[1]}`.trim() : wrapped ? pendingName : "";
    const cells = direct ? direct.slice(2) : wrapped ? wrapped.slice(1) : null;
    if (!cells) {
      // Wrap names only when there is no trailing numeric column or summary label.
      if (/[\p{L}]/u.test(line) && !/\s\d[\d,.원]*$/.test(line) && pendingName.length + line.length < 160) {
        pendingName = `${pendingName} ${line}`.trim();
      } else { incomplete = true; pendingName = ""; }
      continue;
    }
    pendingName = "";
    const values = Object.fromEntries(columns.slice(1).map((column, index) => [column, parseKoreanAmount(cells[index]!)]));
    const quantity = values.quantity;
    const amount = values.amount;
    const unitPrice = values.unitPrice ?? null;
    if (!name || !/[\p{L}]/u.test(name) || quantity === null || quantity <= 0 || amount === null || amount <= 0 ||
        (total !== null && amount > total) || (unitPrice !== null && Math.abs(unitPrice * quantity - amount) > 0.01)) {
      incomplete = true;
      continue;
    }
    items.push({ description: name, quantity, unitPrice: unitPrice?.toFixed(2) ?? null, amount: amount.toFixed(2) });
  }
  return { items, complete: !incomplete && !pendingName };
}

/** Strict, evidence-backed core extraction. Unfamiliar layouts stay on the backup/review path. */
export function parseKoreanReceiptText(source: string): ReceiptPreviewResult | null {
  if (!hasHangul(source)) return null;
  const lines = normalizeKoreanFinancialText(source).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const labeledValues = (pattern: RegExp) => lines.flatMap((line, index) => {
    const normalizedLabel = line.replace(/([가-힣])\s+(?=[가-힣])/g, "$1").replace(/\s*[:：]\s*/g, ":");
    const label = normalizedLabel.match(pattern);
    if (!label) return [];
    const inline = normalizedLabel.slice(label[0].length).trim();
    const value = parseKoreanAmount(inline || lines[index + 1] || "");
    return value !== null ? [value] : [];
  });
  const oneValue = (pattern: RegExp) => {
    const candidates = [...new Set(labeledValues(pattern))];
    return { value: candidates.length === 1 ? candidates[0]! : null, conflict: candidates.length > 1 };
  };
  const totalEvidence = oneValue(totals);
  const total = totalEvidence.value !== null && totalEvidence.value > 0 ? totalEvidence.value : null;
  const taxEvidence = oneValue(/^(?:부가가치세|부가세)[:：]?/);
  const tax = taxEvidence.value;
  const discountEvidence = oneValue(/^(?:할인금액|할인액|할인)[:：]?/);
  const discount = discountEvidence.value;
  const taxable = oneValue(/^(?:과세물품가액|과세금액|공급가액)[:：]?/);
  const taxExempt = oneValue(/^(?:면세물품가액|면세금액)[:：]?/);
  const service = oneValue(/^(?:봉사료|서비스료)[:：]?/);
  const serviceCharge = service.value;
  const hasTaxComponents = taxable.value !== null && tax !== null;
  const taxSum = (taxable.value ?? 0) + (taxExempt.value ?? 0) + (tax ?? 0) + (serviceCharge ?? 0);
  const taxReconciles = total !== null && Math.abs(taxSum - total) < 0.01;
  // 소계 often already includes VAT. Only expose a net subtotal when components reconcile.
  const subtotal = hasTaxComponents && taxReconciles ? taxable.value! + (taxExempt.value ?? 0) : null;
  const conflictingSummary = [totalEvidence, taxEvidence, discountEvidence, taxable, taxExempt, service].some(value => value.conflict) ||
    [tax, discount, taxable.value, taxExempt.value, serviceCharge].some(value => value !== null && value < 0) ||
    (hasTaxComponents && !taxReconciles);

  const currencyEvidence = detectCurrencyEvidence(source);
  const hasDomesticEvidence = /사업자\s*(?:등록)?\s*번호/.test(source) && /부\s*가\s*(?:가치)?\s*세/.test(source);
  const currency = currencyEvidence.currency ?? (hasDomesticEvidence && !currencyEvidence.ambiguous ? "KRW" : "MIXED");
  const currencyConflict = currencyEvidence.ambiguous || (currency !== "KRW" && currency !== "MIXED" && /₩|￦|\d[\d,]*\s*원/.test(source));
  const currencyWarning = currencyConflict ? "Multiple currencies: confirm the amount and settlement currency."
    : !currencyEvidence.currency ? (hasDomesticEvidence ? "KRW inferred from Korean receipt details. Confirm the currency." : "Currency is not shown. Select the receipt currency.") : null;
  const dates = lines.flatMap(line => {
    const match = line.match(/\d{4}(?:\s*년\s*|[./-]\s*)\d{1,2}(?:\s*월\s*|[./-]\s*)\d{1,2}(?:\s*일)?/)
      ?? line.match(/(?:^|(?:거래|결제|승인)일(?:시|자)?\s*[:：]?\s*)(\d{8})(?:\s|$)/);
    const date = match ? parseKoreanDate(match[1] ?? match[0]) : null;
    return date ? [date.toISOString().slice(0, 10)] : [];
  });
  const uniqueDates = [...new Set(dates)];
  const billDate = uniqueDates.length === 1 ? uniqueDates[0]! : null;
  const merchants = lines.flatMap((line, index) => {
    if (!merchantLabel.test(line)) return [];
    const name = line.replace(merchantLabel, "").trim() || lines[index + 1] || "";
    if (!/[\p{L}]/u.test(name) || summary.test(compact(name)) || /[:：]|^\d/.test(name)) return [];
    return [name];
  });
  const uniqueMerchants = [...new Set(merchants)];
  const merchantName = uniqueMerchants.length === 1 ? uniqueMerchants[0]! : null;
  const { items, complete } = parseItems(lines, total === null ? null : total + Math.max(0, discount ?? 0));
  const cancelled = /(?:승인\s*취소|결제\s*취소|취소\s*영수증|환불\s*(?:금액|영수증))/.test(source);
  const itemSum = items.reduce((sum, item) => sum + Number(item.amount), 0);
  // Unit-price and VAT checks stay independent. Never invent or add VAT twice.
  const reconciles = total !== null && items.length > 0 && complete &&
    Math.abs(itemSum - (discount ?? 0) + (serviceCharge ?? 0) - total) < 0.01;
  const requiresReview = cancelled || conflictingSummary || currencyWarning !== null || !merchantName || !billDate || total === null || !reconciles;
  return {
    receiptText: source, receiptType: "generic_receipt", merchantName, billDate,
    documentNumber: null, invoiceNumber: null, bookingReference: null,
    currency, currencyMentions: currency === "MIXED" ? [] : [currency], currencyWarning,
    paymentMethod: /카드\s*결제|신용\s*카드/.test(source) ? "Card" : /현금\s*(?:결제|영수증)/.test(source) ? "Cash" : null,
    receiptPayerName: null, subtotal: subtotal?.toFixed(2) ?? null, tax: tax?.toFixed(2) ?? null,
    serviceCharge: serviceCharge?.toFixed(2) ?? null, discount: discount?.toFixed(2) ?? null, tip: null, rounding: null,
    total: cancelled ? null : total?.toFixed(2) ?? null,
    items, participants: [], splitAllocations: [], receiptAccountMatch: null,
    confidence: requiresReview ? 45 : 92, requiresReview,
  };
}
