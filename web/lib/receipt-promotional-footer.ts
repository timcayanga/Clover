import { isLocalizedReceiptHeading, isLocalizedReceiptAmountLine } from "./localized-receipt-cues";

// A footer changes the parser's input, never the retained optical evidence.
const PROMOTIONAL_FOOTER = /^(?:[•*#-]+\s*)?(?:(?:take|complete|answer|rate|tell us|share)\b.{0,40}\b(?:survey|feedback|experience)\b|(?:customer|guest|receipt)\s+(?:feedback|survey)\b|(?:join|sign up for|enroll in)\b.{0,40}\b(?:loyalty|rewards|membership)\b|(?:loyalty|rewards)\s+(?:offer|promotion)\b|(?:scan|use)\b.{0,50}\b(?:qr(?:\s*code)?|this code)\b.{0,65}\b(?:survey|feedback|rewards?|promo(?:tion)?|discount|offer|coupon|next visit)\b|(?:(?:coupon|voucher)\s+for\s+your\s+next\b|(?:special offer|advertisement|promo(?:tion)?|coupon|voucher)\s*[:!—-])|(?:next|on your next)\s+(?:visit|order|purchase)\b)/i;
const PRINTED_SETTLEMENT = /^(?:grand\s+total|amount\s+(?:due|paid)|total(?:\s+(?:amount|paid|due|bayar))?|jumlah bayar|결제금액|합계)\s*[:：]?\s*(?:(?:[A-Z]{3}|Rp\.?|₱|\$|€|£|฿|¥|₩)\s*)?\d[\d,. ]*(?:\s+(?:[A-Z]{3}|원))?$/iu;
const SOURCE_HEADER = /\b(?:official\s+receipt|sales\s+invoice|cash\s+receipt|receipt\s*(?:number|no\.?|#)|payment successful)\b|^\s*(?:receipt|invoice|sales receipt|struk|영수증|領収書)\s*$/iu;
const SETTLEMENT_CONTINUATION = /^(?:tax|vat(?:able)?|tip|service charge|cash(?: tendered)?|change(?: due)?|card(?: payment)?|payment (?:method|type)|paid (?:with|by)|balance due)\b/i;
const PURCHASE_DATE = /\b(?:\d{1,4}[\/-]\d{1,2}[\/-]\d{1,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b/i;

export function splitReceiptPromotionalFooter(text: string): { body: string; footer: string | null } {
  const lines = text.split(/\r?\n/);
  let hasReceiptHeader = false;
  let hasPurchaseDate = false;
  let hasSettlementDetail = false;
  let foundSettlement = false;
  for (const [index, line] of lines.entries()) {
    const value = line.trim();
    if ((hasReceiptHeader || (hasPurchaseDate && hasSettlementDetail)) && foundSettlement && PROMOTIONAL_FOOTER.test(value)) {
      const suffix = lines.slice(index);
      // A second receipt or a later financial section can follow an offer.
      // Keep the full text when the document boundary is unclear.
      if (suffix.slice(1).some(row => SOURCE_HEADER.test(row.trim()) || isLocalizedReceiptHeading(row) || SETTLEMENT_CONTINUATION.test(row.trim()))) {
        return { body: text, footer: null };
      }
      return { body: lines.slice(0, index).join("\n").trimEnd(), footer: suffix.join("\n") };
    }
    hasReceiptHeader ||= SOURCE_HEADER.test(value) || isLocalizedReceiptHeading(value);
    hasPurchaseDate ||= PURCHASE_DATE.test(value);
    hasSettlementDetail ||= SETTLEMENT_CONTINUATION.test(value);
    foundSettlement ||= PRINTED_SETTLEMENT.test(value) || isLocalizedReceiptAmountLine(value);
  }
  return { body: text, footer: null };
}
