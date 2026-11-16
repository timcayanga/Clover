import { normalizeKoreanFinancialText, parseKoreanAmount, parseKoreanDate } from "@/lib/korean-financial-text";

/** Quality signals only. This never repairs source text or creates a transaction. */
export function koreanStatementLineEvidence(value: string) {
  const text = normalizeKoreanFinancialText(value);
  const dates = text.match(/\d{4}(?:\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일|[./-]\s*\d{1,2}[./-]\s*\d{1,2}\.?)|(?<!\d)\d{8}(?!\d)/g) ?? [];
  let withoutDates = text;
  for (const date of dates) withoutDates = withoutDates.replace(date, " ");
  withoutDates = withoutDates.replace(/\d{1,2}:\d{2}(?::\d{2})?/g, " ");
  // A bare account/reference number is not evidence of money. Require a Won
  // marker or valid thousands grouping; date punctuation must not count.
  const money = withoutDates.match(/(?:KRW\s*|₩\s*)[+-]?[\d,]+(?:\.\d+)?|(?<![\d,.])[+-]?\d[\d,]*(?:\.\d+)?\s*원|(?<![\d,.])\d{1,3}(?:,\d{3})+(?:\.\d+)?(?![\d,.])/gi) ?? [];
  return {
    date: dates.some(date => parseKoreanDate(date) !== null),
    amount: money.some(amount => parseKoreanAmount(amount) !== null),
    balance: /잔액|잔고|기초잔액|기말잔액|청구금액/.test(text),
    transaction: /출금|입금|이체|결제|환불|취소|수수료|이자|거래금액|가맹점/.test(text),
  };
}
