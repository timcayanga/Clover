import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { parseImportText, parseAmountValue, parseDateValue } from "../lib/import-parser";
import { detectCurrencyEvidence } from "../lib/financial-identity-detection";
import { parseReceiptText, assessReceiptPreviewQuality } from "../lib/split-bill";
import { decodeSpreadsheetWorkbookBytes } from "../lib/spreadsheet-import.server";

// Synthetic financial records, never real customer identifiers or transactions.
for (const [text, expected] of Object.entries({
  "2억 3천만원": 230000000, "1만2천500원": 12500, "3백만 5천원": 3005000,
  "(₩2억 3천만)": -230000000, "KRW -12,000": -12000, "1.5만원": 15000, "0원": 0,
})) assert.equal(parseAmountValue(text), expected, text);
for (const text of ["1만 2만원", "1만 20천원", "1 200원", "1,20원", "KRW 12abc", "--12000원", "-₩-12000", "900000000000000000원"])
  assert.equal(parseAmountValue(text), null, `Invalid money must not be repaired silently: ${text}`);
for (const text of ["2026년 10월 1일 오후 25:00", "2026.10.01 10:99", "2026.10.01 24:01", "2026.02.30"])
  assert.equal(parseDateValue(text), null, text);
assert.equal(parseDateValue("2026년 10월 1일 (목요일) 오전 12:00")?.toISOString().slice(0, 10), "2026-10-01");

const receiptBase = ["영수증", "상호 서울식당", "거래일자: 20261001", "통화: KRW"];
const makeReceipt = (items: string[], tail: string[] = []) => [...receiptBase, ...items, "합계금액 24,000원", ...tail].join("\n");
for (const rows of [
  ["상품명 단가 수량 금액", "김치찌개 12,000 2 24,000"],
  ["상품명 수량 단가 금액", "김치찌개 2 12,000 24,000"],
  ["품명 수량 금액", "김치찌개 2 24,000"],
  ["상품명 단가 수량 금액", "김치찌개", "12,000 2 24,000"],
  ["메뉴명 수량 금액", "Seasonal Set 2 24,000"],
]) {
  const result = parseReceiptText(makeReceipt(rows));
  assert.equal(result.items.length, 1, rows.join(" / "));
  assert.equal(result.items[0]?.quantity, 2);
  assert.equal(result.merchantName, "서울식당");
  assert.equal(result.billDate, "2026-10-01");
  assert.equal(result.total, "24000.00");
  assert.equal(result.requiresReview, false, rows.join(" / "));
  assert.equal(assessReceiptPreviewQuality(result).reliableForFastPath, true);
}
assert.equal(parseReceiptText(makeReceipt(["상품명 수량 금액", "김치찌개 2 24,000"]).replace("상호 서울식당", "상호명:\n서울식당")).merchantName, "서울식당");
const basicItems = ["상품명 수량 금액", "김치찌개 2 24,000"];
for (const tail of [["부가세 2,182", "부가세 3,000"], ["과세금액 21,000", "부가세 2,000"], ["할인액 -1,000"], ["상호: 다른식당"]])
  assert.equal(parseReceiptText(makeReceipt(basicItems, tail)).requiresReview, true, tail.join(" / "));
assert.equal(parseReceiptText(makeReceipt(["상품명 단가 수량 금액", "김치찌개 11,000 2 24,000"])).requiresReview, true);
assert.equal(parseReceiptText(makeReceipt(["상품명 수량 금액", "읽을수없는행 500", "김치찌개 2 24,000"])).requiresReview, true);
const discountReceipt = makeReceipt(["상품명 단가 수량 금액", "김치찌개 13,000 2 26,000"], ["할인금액 2,000"]);
assert.equal(parseReceiptText(discountReceipt).requiresReview, false);
const serviceReceipt = makeReceipt(["상품명 수량 금액", "김치찌개 2 22,000"], ["봉사료 2,000"]);
assert.equal(parseReceiptText(serviceReceipt).requiresReview, false);
assert.equal(parseReceiptText(serviceReceipt).serviceCharge, "2000.00");

const parseCsv = (text: string) => parseImportText(text, "한국.csv", "text/csv");
const foreign = parseCsv([
  "계좌유형,신용카드", "청구통화,KRW",
  "승인일,가맹점명,원화청구금액,해외이용금액,해외이용통화,승인번호",
  "2026-10-01,Example Store,13500,10,USD,시험001",
].join("\n"));
assert.equal(foreign[0]?.amount, "13500.00");
assert.equal(foreign[0]?.currency, "KRW");
assert.equal(foreign[0]?.rawPayload?.originalAmount, 10);
assert.equal(foreign[0]?.rawPayload?.originalCurrency, "USD");
assert.equal(foreign[0]?.rawPayload?.sourceCells instanceof Array, true);
assert.equal(detectCurrencyEvidence("결제통화: KRW\n해외이용통화: USD\n해외이용금액: 10 USD").currency, "KRW");
assert.equal(detectCurrencyEvidence("청구통화: KRW\n결제통화: USD").ambiguous, true);
const impliedWon = parseCsv("승인일,가맹점명,원화청구금액,해외이용금액(USD),거래구분\n2026-10-01,Example Store,13500,10,지출");
assert.equal(impliedWon[0]?.currency, "KRW");
assert.equal(impliedWon[0]?.rawPayload?.originalCurrency, "USD");
const headerForeign = parseCsv("날짜,가맹점명,금액(KRW),해외이용금액(USD),거래구분\n2026-10-01,Example Store,13500,10,지출");
assert.equal(headerForeign[0]?.currency, "KRW");
assert.equal(headerForeign[0]?.rawPayload?.originalCurrency, "USD");
const headerConflict = parseCsv("날짜,가맹점명,금액(USD),통화,거래구분\n2026-10-01,Example Store,100,KRW,지출");
assert.equal(headerConflict[0]?.rawPayload?.reviewRequired, true);
const globalUnit = parseCsv("단위,천원\n날짜,내용,출금액,거래후잔액\n2026-10-01,서울식당,12,88");
assert.equal(globalUnit[0]?.amount, "12000.00");
assert.equal(globalUnit[0]?.currency, "KRW");
assert.equal(globalUnit[0]?.rawPayload?.balance, 88000);
const foreignFee = parseCsv("단위,천원\n날짜,내용,출금액,수수료(USD)\n2026-10-01,서울식당,12,0.5");
assert.equal(foreignFee[0]?.amount, "12000.00");
assert.equal(foreignFee[0]?.rawPayload?.fee, 0.5, "Won units must not scale a foreign-currency fee");
const statusRows = parseCsv("날짜,내용,금액,통화,상태\n2026-10-01,서울식당,12000,KRW,환불 완료\n2026-10-01,서울식당,12000,KRW,환불예정");
assert.equal(statusRows.length, 1);
assert.equal(statusRows[0]?.type, "income");
const balanceMismatch = parseCsv("날짜,내용,출금액(원),거래후잔액\n2026-10-01,첫거래,1000,9000\n2026-10-02,둘째거래,1000,7500");
assert.equal(balanceMismatch[1]?.rawPayload?.reviewRequired, true);
assert.ok((balanceMismatch[1]?.parserConfidence ?? 100) < 70);
for (const text of [
  "날짜,내용,출금액(원)\n2026-10-01,서울식당,12abc",
  "날짜,내용,출금액(원)\n2026-02-30,서울식당,12000",
  "날짜,내용,출금액(원),입금액(원)\n2026-10-01,서울식당,12000,12000",
]) assert.throws(() => parseCsv(text), /safely/);
const refs = parseCsv("날짜,내용,출금액(원),거래번호\n2026-10-01,같은거래,12000,가나다001\n2026-10-01,같은거래,12000,라마바001");
assert.equal(refs.length, 2, "Distinct Korean references must not collapse into the same numeric suffix");

const holdings = [
  ["종목명", "증권사", "보유수량", "평가금액(원)", "평가일", "월납입액(원)", "종목코드"],
  ["테스트펀드", "테스트증권", "42.96436", "230000", "2026년 10월 1일", "10000", "SYN001"],
  ["다른펀드", "다른증권", "20.12345", "120000", "2026년 10월 1일", "5000", "SYN002"],
  ["합계", "", "", "350000", "", "", ""],
];
const holdingRows = parseCsv(holdings.map(row => row.join(",")).join("\n"));
assert.equal(holdingRows.length, 2);
assert.deepEqual(holdingRows.map(row => row.rawPayload?.marketValue), [230000, 120000]);
assert.deepEqual(holdingRows.map(row => row.rawPayload?.quantity), [42.96436, 20.12345]);
assert.ok(holdingRows.every(row => row.amount === "0.00" && row.currency === "KRW" && row.rawPayload?.kind === "account_snapshot_marker"));
assert.equal(holdingRows[0]?.rawPayload?.monthlyContribution, 10000);
assert.equal(holdingRows[0]?.rawPayload?.totalCost, undefined);
assert.equal(holdingRows[0]?.rawPayload?.sourceRowIndex, 2);
assert.throws(() => parseCsv([...holdings, holdings[1]!].map(row => row.join(",")).join("\n")), /repeated Korean investment/);
assert.throws(() => parseCsv("기준일,계좌명,잔액(원)\n2026-10-01,여행통장,12000\n2026-10-01,저축통장,unreadable"), /safely read a balance/);
const malformedHoldings = holdings.map(row => [...row]);
malformedHoldings[2]![3] = "unreadable";
assert.throws(() => parseCsv(malformedHoldings.map(row => row.join(",")).join("\n")), /safely/);
const unknownCurrency = holdings.map(row => [...row]);
unknownCurrency[0]![3] = "평가금액";
assert.throws(() => parseCsv(unknownCurrency.map(row => row.join(",")).join("\n")), /currency/);

async function verifyWorkbooks() {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ...holdings, [], ["날짜", "내용", "출금액(원)"], ["2026-10-01", "서울식당", "12000"],
  ]), "한국 투자와 거래");
  const decode = () => decodeSpreadsheetWorkbookBytes(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
  const parsed = parseImportText(await decode(), "한국.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.equal(parsed.length, 3, "Investment and transaction tables on one sheet must both survive");
  assert.equal(parsed.filter(row => row.type === "expense").length, 1);
  assert.equal(parsed[0]?.rawPayload?.worksheetName, "한국 투자와 거래");
  assert.equal(parsed[2]?.rawPayload?.sourceRowIndex, 6, "Source row matches the decoded worksheet table");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["알수없는금융내역"], ["보유자산", "12000"]]), "미지원 투자내역");
  assert.equal(parseImportText(await decode(), "혼합.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").length, 0,
    "An unreadable Korean financial sheet must request full-workbook backup, not silently disappear");
  console.log("PASS Korean extended imports: receipt layouts/reconciliation, unit expressions, foreign billing, refunds, safe ledgers, investment tables and real workbook decoding.");
}
verifyWorkbooks().catch(error => { console.error(error); process.exitCode = 1; });
