import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { parseImportText, parseImportTextGenericOnly } from "../lib/import-parser";
import { parseReceiptText, assessReceiptPreviewQuality } from "../lib/split-bill";
import { buildKoreanBankTable } from "../lib/korean-bank-table";
import { buildLayoutAwarePdfTextFromContentItems, pdfTextLayerLooksSufficientForParsing } from "../lib/import-file-text.server";
import { assessImportEvidenceSafety, assertSafeImportEvidence } from "../lib/import-evidence-safety";
import { decodeSpreadsheetWorkbookBytes } from "../lib/spreadsheet-import.server";
import { decodeStructuredDelimitedBytes } from "../lib/structured-delimited-decoder";

// Original synthetic cases. Never customer statements or actual bank identifiers.
const preamble = ["은행명: 테스트은행", "계좌명: 여행통장", "계좌번호: 00001234", "통화: KRW"];
const header = "거래일자  적요  출금액  입금액  잔액";
const data = ["2026년 9월 29일  서울식당  12,000  0  88,000", "2026년 9월 30일  급여  0  100,000  188,000"];
const statement = [...preamble, header, ...data].join("\n");
for (const parse of [parseImportText, parseImportTextGenericOnly]) {
  const rows = parse(statement, "한국.pdf", "application/pdf");
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.amount), ["12000.00", "100000.00"]);
  assert.deepEqual(rows.map(row => row.type), ["expense", "income"]);
  assert.deepEqual(rows.map(row => row.date), ["2026-09-29", "2026-09-30"]);
  assert.ok(rows.every(row => row.currency === "KRW" && row.accountNumber === "00001234" && row.rawPayload?.reviewRequired));
  assert.deepEqual(rows.map(row => row.rawPayload?.balance), [88000, 188000]);
  assert.equal(rows[0]?.rawPayload?.sourceText, data[0]);
  assert.equal(rows[0]?.rawPayload?.sourceLineNumber, 6);
  assert.doesNotThrow(() => assertSafeImportEvidence(rows, statement));
  assert.equal(parse(statement.replace(/ {2,}/g, " "), "한국.pdf", "application/pdf").length, 0,
    "Flattened columns must not become last-number transactions or an account-number expense");
  assert.equal(parse(statement.replace("  0  100,000", "  100,000"), "한국.pdf", "application/pdf").length, 0,
    "Incomplete rows cannot be omitted alongside good ones");
  assert.equal(parse(statement.replace("  12,000  0", "  읽기불가  0"), "한국.pdf", "application/pdf").length, 0);
  assert.equal(parse(statement.replace("통화: KRW\n", ""), "한국.pdf", "application/pdf").length, 0, "Language alone does not establish currency");
  assert.equal(parse(statement.replace(header, header + "  거래점"), "한국.pdf", "application/pdf").length, 0,
    "An unsupported extra column must route to backup rather than generic last-number parsing");
  assert.equal(parse(statement.replace(header, "적요 거래일자 출금액 입금액 잔액"), "한국.pdf", "application/pdf").length, 0);
  assert.equal(parse("계좌번호: 99999999\n" + statement, "한국.pdf", "application/pdf").length, 0,
    "Conflicting preamble account identities cannot silently use the first value");
  assert.equal(parse(statement + "\n계좌번호: 99999999\n" + data[1], "한국.pdf", "application/pdf").length, 0);
}
assert.equal(buildKoreanBankTable("Date Description Debit Credit Balance\n2026-09-30 Shop 12000 0 88000"), null);
const spacedPdfRows = [...preamble.map(text => [text]), header.split(/ {2,}/), ...data.map(row => row.split(/ {2,}/))];
const xs = [10, 160, 320, 440, 560];
const items = spacedPdfRows.flatMap((cells, row) => cells.map((str, column) => ({
  str, transform: [1, 0, 0, 1, xs[column]!, 700 - row * 20], width: column === 0 ? 110 : 50, height: 10,
})));
const layout = buildLayoutAwarePdfTextFromContentItems(items);
assert.match(layout, /서울식당\t12,000\t0\t88,000/);
assert.equal(parseImportText(layout, "한국.pdf", "application/pdf").length, 2, "Actual PDF item positioning must retain usable columns");
assert.ok(layout.length < 250);
assert.equal(pdfTextLayerLooksSufficientForParsing(layout), true, "A short intact Korean table should preserve its native text");
assert.equal(pdfTextLayerLooksSufficientForParsing(layout.replace(/\t/g, " ")), false, "Short flattened tables still need OCR");
assert.equal(pdfTextLayerLooksSufficientForParsing(layout.replace("통화: KRW\n", "")), false);
assert.equal(pdfTextLayerLooksSufficientForParsing(layout.replace("서울식당", "서울\uFFFD당")), false);
assert.equal(pdfTextLayerLooksSufficientForParsing([...preamble, header, data[0]].join("\n")), false, "One sparse row is insufficient evidence");
const unsafeRows = [{ amount: "88000", confidence: 100, rawPayload: { line: data[0] } }];
assert.ok(assessImportEvidenceSafety(unsafeRows, statement).reasons.includes("korean_table_without_column_evidence"));
assert.throws(() => assertSafeImportEvidence(unsafeRows, statement), /Nothing was added/);
for (const date of ["2026년 9월 30일", "2026.09.30", "20260930"]) {
  assert.ok(assessImportEvidenceSafety([{amount: "2026", rawPayload: {parserEvidence: {source_text: `${date} 테스트 12000원`}}}]).reasons.includes("amount_from_date"));
  assert.doesNotThrow(() => assertSafeImportEvidence([{amount: "2026", rawPayload: {parserEvidence: {source_text: `${date} 테스트 2026원`}}}]));
}
assert.throws(() => assertSafeImportEvidence([{amount: "230000", confidence: 90}], "종목명 평가금액 평가일\n테스트펀드 230000원 2026-09-30"), /Nothing was added/);
assert.doesNotThrow(() => assertSafeImportEvidence([{amount: "0", rawPayload: {kind: "account_snapshot_marker"}}], "종목명 평가금액 평가일"));
assert.doesNotThrow(() => assertSafeImportEvidence([{amount: "20260930", rawPayload: {parserEvidence: {source_text: "2026년 9월 30일 상품 20260930원"}}}]));

const receipt = ["영수증", "상호: 서울식당", "거래일자: 2026년 9월 30일", "통화: KRW", "영수증번호: 00001234", "메뉴명 금액", "김치찌개 12,000", "비빔밥 10,000", "합계금액 22,000원"].join("\n");
const withExpiry = parseReceiptText(receipt + "\n쿠폰 유효기간: 2026-12-31\n출력일시: 2026-10-01 09:00");
assert.equal(withExpiry.billDate, "2026-09-30");
assert.equal(withExpiry.documentNumber, "00001234");
assert.equal(withExpiry.items.length, 2);
assert.ok(withExpiry.items.every(item => item.quantity === null && item.unitPrice === null), "An omitted quantity is not an invented one");
assert.equal(withExpiry.requiresReview, false);
assert.equal(assessReceiptPreviewQuality(withExpiry).reliableForFastPath, true);
assert.equal(parseReceiptText(receipt + "\n승인일자: 2026-10-01").billDate, null, "Conflicting payment dates need review");
assert.equal(parseReceiptText(receipt.replace("2026년 9월 30일", "잘못된 날짜") + "\n출력일시: 2026-10-01").billDate, null);
assert.equal(parseReceiptText(receipt.replace("2026년 9월 30일", "2026년 9월 30일 오후 25:00")).billDate, null);
assert.equal(parseReceiptText(receipt.replace("2026년 9월 30일", "20260930 오후 1:30")).billDate, "2026-09-30");
assert.equal(parseReceiptText(receipt.replace("2026년 9월 30일", "20260930 25:00")).billDate, null);
assert.equal(parseReceiptText(receipt.replace("거래일자: 2026년 9월 30일", "거래일자:\n2026년 9월 30일")).billDate, "2026-09-30");
assert.equal(parseReceiptText(receipt + "\n영수증번호: 9999").requiresReview, true);
assert.equal(parseReceiptText(receipt + "\n승인취소").total, null);
assert.equal(parseReceiptText(receipt.replace("10,000", "9,000")).requiresReview, true);

const holdingsRows = [["증권사", "테스트증권"], ["평가일자", "2026년 9월 30일"], ["단위", "천원"],
  ["종목명", "보유수량", "평가금액", "종목코드"], ["테스트펀드", "42.96436", "230", "005930"]];
const holdingsCsv = holdingsRows.map(row => row.join(",")).join("\n");
const legacyHoldings = Buffer.from("wfWxx7vnLMXXvbrGrsH1sccKxvKwocDPwNosMjAyNrPiIDm/+SAzMMDPCrTcwKcsw7W/+ArBvrjxuO0surjAr7z2t64sxvKwobHdvtcswb648cTateUKxde9usauxt215Sw0Mi45NjQzNiwyMzAsMDA1OTMw", "base64");
assert.equal(decodeStructuredDelimitedBytes(legacyHoldings), holdingsCsv, "CP949 decoding must recognize a holdings header whose provider/date are in the preamble");
const holdings = parseImportText(holdingsCsv, "보유내역.csv", "text/csv");
assert.equal(holdings.length, 1);
assert.equal(holdings[0]?.institution, "테스트증권");
assert.equal(holdings[0]?.date, "2026-09-30");
assert.equal(holdings[0]?.rawPayload?.marketValue, 230000);
assert.equal(holdings[0]?.rawPayload?.quantity, 42.96436);
assert.equal(holdings[0]?.rawPayload?.providerSource, "preamble");
assert.equal(holdings[0]?.rawPayload?.valuationDateSource, "preamble");
assert.equal(holdings[0]?.amount, "0.00");
for (const prefix of ["증권사,다른증권\n", "기준일,2026-10-01\n", "통화,USD\n통화,KRW\n"]) {
  assert.throws(() => parseImportText(prefix + holdingsCsv, "보유.csv", "text/csv"), /conflicting Korean investment/);
}
assert.throws(() => parseImportText(holdingsCsv.replace("평가일자,2026년 9월 30일\n", ""), "보유.csv", "text/csv"), /safely/);
assert.throws(() => parseImportText(holdingsCsv.replace("증권사,테스트증권\n", ""), "보유.csv", "text/csv"), /safely/);
assert.throws(() => parseImportText("증권사,테스트증권\n평가일자,2026-09-30\n종목명,평가금액,통화\n동일펀드,100,KRW\n동일펀드,100,USD", "보유.csv", "text/csv"), /repeated Korean investment identities/);
assert.throws(() => parseImportText(holdingsCsv.replace("종목코드", "월납입액").replace("005930", "알수없음"), "보유.csv", "text/csv"), /contribution value/);
async function workbook() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(holdingsRows), "보유종목");
  const text = await decodeSpreadsheetWorkbookBytes(XLSX.write(wb, {bookType: "xlsx", type: "buffer"}));
  const rows = parseImportText(text, "한국.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.rawPayload?.marketValue, 230000);
  assert.equal(rows[0]?.rawPayload?.worksheetName, "보유종목");
  console.log("PASS Korean layout support: explicit bank columns/PDF positioning, generic-fallback safeguards, date evidence, receipt dates/items/IDs, investment preambles and XLSX routing.");
}
workbook().catch(error => { console.error(error); process.exitCode = 1; });
