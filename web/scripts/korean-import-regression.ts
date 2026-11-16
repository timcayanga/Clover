import { getBankSlug, normalizeBankName } from "@/lib/data-qa-banks";
import assert from "node:assert/strict";
import { guessCategoryName, parseAmountValue, parseDateValue, parseImportText } from "@/lib/import-parser";
import { detectUnknownInstitutionEvidence, detectCurrencyEvidence, normalizeGlobalCurrencyCode } from "@/lib/financial-identity-detection";
import { assessFinancialUploadScope } from "@/lib/financial-upload-scope";
import { decodeStructuredDelimitedBytes } from "@/lib/structured-delimited-decoder";
import { formatCurrencyAmount } from "@/lib/currency-format";
import { parseReceiptText, assessReceiptPreviewQuality } from "@/lib/split-bill";
import { resolveTransactionContext } from "@/lib/context-corpus";
import { isSuspiciousReceiptMerchantName } from "@/lib/split-bill";

// Synthetic fixtures. These contain no customer records or copied payment identifiers.
for (const amount of ["₩12,000", "12,000원", "KRW 12000", "￦１２，０００", "1.2만원"]) {
  assert.equal(parseAmountValue(amount), 12000, amount);
}
assert.equal(parseAmountValue("(12,000원)"), -12000);
assert.equal(parseAmountValue("₩-12,000"), -12000);
assert.equal(parseAmountValue("2억원"), 200000000);
assert.equal(parseAmountValue("2억 3천만원"), 230000000);
assert.equal(parseAmountValue("카드 1234 12,000원"), null, "Identifiers are not amounts");
for (const date of ["2026년 9월 30일", "2026. 09. 30. 오후 1:45", "2026-09-30 01:45:00", "20260930", "2026년 9월 30일 (수)"]) {
  assert.equal(parseDateValue(date)?.toISOString().slice(0, 10), "2026-09-30", date);
}
assert.equal(parseDateValue("2026년 2월 30일"), null);
assert.equal(normalizeGlobalCurrencyCode("원화"), "KRW");
assert.equal(detectUnknownInstitutionEvidence("은행명: 테스트은행\n계좌번호: 00001234").institution, "테스트은행");
assert.equal(normalizeBankName("테스트은행"), "테스트은행");
assert.notEqual(getBankSlug("테스트은행"), getBankSlug("다른은행"));
assert.equal(normalizeGlobalCurrencyCode("ＫＲＷ"), "KRW");
assert.equal(detectCurrencyEvidence("통화: USD\n" + "원거래금액 12,000원\n".repeat(10)).currency, "USD");
for (const text of ["합계 12,000원", "금액(원)", "통화: KRW", "￦１２，０００"]) {
  assert.equal(detectCurrencyEvidence(text).currency, "KRW", text);
}
assert.equal(detectCurrencyEvidence("상호: 서울식당").currency, null, "Hangul alone does not imply KRW");
assert.equal(detectCurrencyEvidence("통화: USD\n원거래통화: KRW").currency, "USD", "Original currency is separate from settlement currency");
assert.equal(formatCurrencyAmount("12000.00", "KRW"), "₩12,000");
assert.equal(formatCurrencyAmount("12000.25", "KRW"), "₩12,000.25", "Preserve nonzero fractions in valuations");
assert.equal(formatCurrencyAmount(12000, "PHP"), "₱12,000.00");

const csv = [
  "은행명,테스트은행", "계좌명,여행 통장", "계좌번호,00001234", "통화,원",
  "거래일시,적요,출금액(원),입금액(원),거래후잔액,거래번호",
  '2026년 9월 29일,서울식당,"12,000",0,"88,000",SYN-001',
  '2026.09.30 09:30:00,급여,0,"100,000","188,000",SYN-002',
].join("\n");
const rows = parseImportText(csv, "거래내역.csv", "text/csv");
assert.equal(rows.length, 2);
assert.equal(rows[0].merchantRaw, "서울식당");
assert.equal(rows[0].amount, "12000.00");
assert.equal(rows[0].currency, "KRW");
assert.equal(rows[0].accountNumber, "00001234");
assert.equal(rows[0].type, "expense");
assert.equal(rows[1].type, "income");
assert.equal(rows[1].rawPayload?.balanceReconciliation, "matched");
assert.equal((rows[0].rawPayload?.originalHeaders as string[])[0], "거래일시");
assert.equal(decodeStructuredDelimitedBytes(new TextEncoder().encode(csv)), csv);
// CP949 bytes for a Korean financial header, generated once from the synthetic text.
const legacyHeaders = Uint8Array.from([176,197,183,161,192,207,192,218,44,192,251,191,228,44,177,221,190,215,10]);
assert.equal(decodeStructuredDelimitedBytes(legacyHeaders).trim(), "거래일자,적요,금액");
assert.equal(decodeStructuredDelimitedBytes(Uint8Array.from([67,97,102,233])), "Café");
const scaled = parseImportText("날짜,내용,출금액(천원)\n2026-09-30,서울식당,12", "원장.csv", "text/csv");
assert.equal(scaled[0].amount, "12000.00");
assert.equal(scaled[0].currency, "KRW");
const balances = parseImportText("기준일,계좌명,잔액(원),계좌유형\n2026-09-30,한국 여행,120000,예금\n2026-09-30,합계,120000,예금", "잔액.csv", "text/csv");
assert.equal(balances.length, 1);
assert.equal(balances[0].rawPayload?.kind, "account_snapshot_marker");
assert.equal(balances[0].currency, "KRW");
assert.throws(() => parseImportText("기준일,계좌명,잔액\n2026-09-30,한국 여행,120000", "잔액.csv", "text/csv"), /identify the currency/);
const foreign = parseImportText("날짜,가맹점명,금액,통화,거래구분\n2026-09-30,서울식당,500,USD,지출", "내역.csv", "text/csv");
assert.equal(foreign[0].currency, "USD");
const conflict = parseImportText("날짜,가맹점명,금액,통화,거래구분\n2026-09-30,서울식당,12000원,USD,지출", "내역.csv", "text/csv");
assert.equal(conflict[0].rawPayload?.reviewRequired, true);
const ambiguous = parseImportText("날짜,내용,금액\n2026-09-30,서울식당,12000", "내역.csv", "text/csv");
assert.equal(ambiguous[0].rawPayload?.reviewRequired, true);
assert.equal(parseImportText("날짜,내용,금액,통화,상태\n2026-09-30,서울식당,12000,KRW,승인취소", "내역.csv", "text/csv").length, 0);
const workbookText = `__CLOVER_WORKSHEET__,1,거래내역\n${csv}`;
const workbookRows = parseImportText(workbookText, "한국.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
assert.equal(workbookRows.length, 2);
assert.equal(workbookRows[0].currency, "KRW");
assert.equal(workbookRows[0].accountName, "여행 통장");
assert.equal(workbookRows[0].accountNumber, "00001234");
const noAccountWorkbook = "__CLOVER_WORKSHEET__,0,사용내역\n날짜,내용,출금액(원)\n2026-09-30,서울식당,12000";
assert.equal(parseImportText(noAccountWorkbook, "사용내역.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")[0].currency, "KRW");

const mixedWorkbook = "__CLOVER_WORKSHEET__,0,내역\n계좌명,잔액(원)\n저축,50000\n\n날짜,내용,출금액(원)\n2026-09-30,서울식당,12000";
const mixedRows = parseImportText(mixedWorkbook, "mixed.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
assert.equal(mixedRows.find(row => row.rawPayload?.source === "structured_transaction_csv")?.accountName, "Cash", "A preceding inventory header is not account metadata");

const receipt = ["영수증", "상호: 서울식당", "2026년 9월 30일", "통화: KRW", "상품명 수량 금액", "김치찌개 2 24,000", "합 계 24,000원", "과세물품가액 21,818", "부가세 2,182", "카드 결제 24,000", "받은금액 30,000", "거스름돈 6,000"].join("\n");
const preview = parseReceiptText(receipt);
assert.equal(preview.merchantName, "서울식당");
assert.equal(isSuspiciousReceiptMerchantName(preview.merchantName), false);
assert.equal(preview.currency, "KRW");
assert.equal(preview.total, "24000.00");
assert.equal(preview.tax, "2182.00");
assert.equal(preview.subtotal, "21818.00");
assert.equal(preview.items.length, 1, "Summary and payment rows are not items");
assert.equal(preview.requiresReview, false);
assert.equal(guessCategoryName("유니클로", "expense"), "Shopping");
assert.equal(guessCategoryName("스타벅스 강남점", "expense"), "Food & Dining");
assert.equal(parseReceiptText("BUTTER\n면 세 물품 가액 0\n과 세 물품 가액 2,836\n총합 기믹 . Tig").currency, "MIXED");
assert.equal(assessReceiptPreviewQuality(preview).reliableForFastPath, true);
assert.equal(parseReceiptText(receipt + "\n결제금액 25,000원").total, null, "Conflicting totals require backup/review");
assert.equal(parseReceiptText(receipt + "\n승인취소").total, null, "Cancellation must not become purchase");
assert.equal(parseReceiptText(receipt.replace("통화: KRW", "통화: USD").replace("24,000원", "24,000")).currency, "USD");
assert.equal(parseReceiptText(receipt.replace("통화: KRW", "").replace("24,000원", "24,000")).currency, "MIXED");
assert.equal(assessFinancialUploadScope({ text: receipt, fileName: "IMG_1234.jpg" }).decision, "financial");
assert.equal(assessFinancialUploadScope({ text: "할인 쿠폰 12,000원 2026년 9월 30일", fileName: "IMG_2.jpg" }).decision, "non_financial");
assert.equal(resolveTransactionContext({ merchantRaw: "유니클로", currency: "KRW" }).countryCode, "KR");
assert.equal(resolveTransactionContext({ institution: "신한은행" }).countryCode, "KR");
console.log("Korean import regression passed: amounts, dates, currency, receipts, ledgers, workbook routing, legacy encoding, evidence and safe review.");
