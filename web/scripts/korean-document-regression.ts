import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { parseImportText } from "../lib/import-parser";
import { decodeSpreadsheetWorkbookBytes } from "../lib/spreadsheet-import.server";
import { decodeStructuredDelimitedBytes } from "../lib/structured-delimited-decoder";
import { hasKoreanFinancialHeaders } from "../lib/korean-financial-text";
import { koreanStatementLineEvidence } from "../lib/korean-statement-evidence";
import { pdfTextLayerLooksSufficientForParsing, shouldRunSecondaryPdfOcrPass } from "../lib/import-file-text.server";

// Original synthetic fixtures, including actual CP949 bytes and workbook binaries.
const legacy = Buffer.from("wb648bjtLMH1sce75yy6uMCvvPa3rizG8rChsd2+1yi/+CksxvKwocDPLMG+uPHE2rXlCsXXvbrGrsbdteUsxde9usauwfWxxyw0Mi45NjQzNiwyMzAwMDAsMjAyNi0wOS0zMCwwMDU5MzA=", "base64");
const decoded = decodeStructuredDelimitedBytes(legacy);
assert.match(decoded, /종목명,증권사/);
const holdings = parseImportText(decoded, "보유내역.csv", "text/csv");
assert.equal(holdings[0]?.rawPayload?.quantity, 42.96436);
assert.equal(holdings[0]?.rawPayload?.marketValue, 230000);
assert.equal(holdings[0]?.rawPayload?.assetSymbol, "005930");
assert.equal(holdings[0]?.currency, "KRW");
assert.equal(hasKoreanFinancialHeaders("날짜\n내용\n금액"), false, "Separate prose labels do not establish a legacy table encoding");
assert.match(decodeStructuredDelimitedBytes(Buffer.from([67,97,102,233])), /Café/, "Western legacy fallback remains available");

const csv = (text: string) => parseImportText(text, "한국.csv", "text/csv");
const sectionUnits = csv("단위,천원\n날짜,내용,출금액,수수료,거래후잔액\n2026-09-29,서울식당,12,0.5,88\n단위,원\n2026-09-30,서점,20000,500,68000");
assert.deepEqual(sectionUnits.map(row => row.amount), ["12000.00", "20000.00"]);
assert.deepEqual(sectionUnits.map(row => row.rawPayload?.fee), [500, 500]);
assert.deepEqual(sectionUnits.map(row => row.rawPayload?.balance), [88000, 68000]);
for (const row of ["2026-09-30,서울식당,???,", "2026-09-30,서울식당,12000,???", ",서울식당,12000,", "2026-09-30,,12000,"]) {
  assert.throws(() => csv(`날짜,내용,출금액(원),입금액(원)\n2026-09-29,첫거래,1000,\n${row}`), /safely/,
    "Partially readable rows cannot silently disappear alongside valid transactions");
}
const datedBalance = csv("기준일,2026년 9월 30일\n단위,천원\n계좌명,잔액\n여행통장,125.5")[0]!;
assert.equal(datedBalance.date, "2026-09-30");
assert.equal(datedBalance.currency, "KRW");
assert.equal(datedBalance.rawPayload?.balance, 125500);
assert.deepEqual(datedBalance.rawPayload?.sourceCells, ["여행통장", "125.5"]);
const undated = csv("계좌명,잔액(원)\n여행통장,12000")[0]!;
assert.equal(undated.rawPayload?.reviewRequired, true);
assert.ok((undated.parserConfidence ?? 100) < 70);
for (const text of [
  "기준일,계좌명,잔액(원)\n2026-02-30,여행통장,12000",
  "기준일,잘못된날짜\n계좌명,잔액(원)\n여행통장,12000",
]) assert.throws(() => csv(text), /safely read a date/);
assert.throws(() => csv("기준일,계좌명,잔액(원),통화\n2026-09-30,여행통장,12000,USD"), /conflicting currencies/);
assert.throws(() => csv("기준일,계좌명,잔액(원)\n2026-09-30,여행통장,12000\n2026-09-30,여행통장,13000"), /different balances/);
assert.throws(() => csv("기준일,계좌명,계좌번호,잔액,통화\n2026-09-30,외화통장,000123,12000,KRW\n2026-09-30,외화통장,000123,100,USD"), /multiple currencies/,
  "Currency conflicts must stop before confirmation groups balances through their shared account number");
assert.throws(() => csv("기준일,계좌명,잔액,통화\n2026-09-30,외화통장,12000,KRW\n2026-09-30,외화통장,100,USD"), /multiple currencies/);

const koreanPdfText = [
  "테스트은행 거래내역조회", "은행명 테스트은행", "계좌명 여행 통장", "통화 KRW",
  "거래일자 적요 출금액 입금액 잔액",
  "2026년 9월 27일 서울식당 출금 12,000 0 88,000",
  "2026년 9월 28일 급여 입금 0 100,000 188,000",
  "2026년 9월 29일 서점 출금 20,000 0 168,000",
  "2026년 9월 30일 교통비 출금 3,000 0 165,000",
  "최종잔액 165,000원", "조회하신 거래내역을 확인하시고 문의사항은 해당 은행에 연락하시기 바랍니다.",
].join("\n");
assert.equal(pdfTextLayerLooksSufficientForParsing(koreanPdfText), true);
assert.equal(shouldRunSecondaryPdfOcrPass({ primaryOcrText: koreanPdfText, renderedPages: [{ page: 1, totalPages: 1 }], fileName: "한국.pdf" }), false);
assert.equal(shouldRunSecondaryPdfOcrPass({ primaryOcrText: koreanPdfText, renderedPages: [{ page: 1, totalPages: 2 }], fileName: "한국.pdf" }), true, "Missing pages still require extraction");
assert.equal(pdfTextLayerLooksSufficientForParsing(koreanPdfText.replace("서울식당", "\uFFFD\uFFFD\uFFFD")), false);
assert.equal(pdfTextLayerLooksSufficientForParsing(koreanPdfText.replace(/\d{1,3}(?:,\d{3})+/g, "")), false, "Dates and references alone cannot establish readable financial rows");
assert.equal(koreanStatementLineEvidence("2026.09.30 12:30:00 계좌번호 000123456789").amount, false);
assert.equal(koreanStatementLineEvidence("2026년 2월 30일 출금 12,000원").date, false);

async function verifyWorkbooks() {
  const expectedDate = "2026-09-30";
  for (const date1904 of [false, true]) {
    const base = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
    const serial = (Date.UTC(2026, 8, 30) - base) / 86400000;
    for (const bookType of ["xlsx", "xls", "xlsb", "ods"] as const) {
      const workbook = XLSX.utils.book_new();
      workbook.Workbook = { WBProps: { date1904 } };
      const sheet = XLSX.utils.aoa_to_sheet([
        ["거래일자", "내용", "출금액(원)"], [serial, "서울식당", 12000],
        ["보유수량", "종목명", "증권사", "평가금액(원)", "평가일", "종목코드"],
        [45000, "테스트펀드", "테스트증권", 230000, serial, 5930],
      ]);
      sheet.F4.z = "000000";
      XLSX.utils.book_append_sheet(workbook, sheet, "한국 내역");
      const text = await decodeSpreadsheetWorkbookBytes(XLSX.write(workbook, { type: "buffer", bookType }));
      assert.match(text, new RegExp(`${expectedDate},서울식당,12000`), `${bookType} date system ${date1904}`);
      assert.match(text, /45000,테스트펀드,테스트증권,230000,2026-09-30,005930/, "The new quantity header stops earlier date conversion");
      const rows = parseImportText(text, `한국.${bookType}`, "application/octet-stream");
      assert.equal(rows.length, 2, bookType);
      assert.equal(rows[1]?.rawPayload?.quantity, 45000);
      assert.equal(rows[1]?.date, expectedDate);
    }
    const history = XLSX.utils.book_new();
    history.Workbook = { WBProps: { date1904 } };
    XLSX.utils.book_append_sheet(history, XLSX.utils.aoa_to_sheet([
      ["기준일", "여행통장(원)", "저축통장(원)"], [serial, 12000, 30000], [], [serial + 1, 10000, 30000],
    ]), "잔액 기록");
    const historyText = await decodeSpreadsheetWorkbookBytes(XLSX.write(history, { type: "buffer", bookType: "xlsx" }));
    assert.match(historyText, /2026-09-30,12000,30000/);
    assert.match(historyText, /2026-10-01,10000,30000/, "A blank spacer does not change the date system");
  }
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ...Array.from({ length: 15 }, () => ["보고서 설명"]),
    ["내용", "날짜", "금액(원)", "", "기준일", "계좌명", "잔액(원)"],
    ["서울식당", 46295, 12000, "", 46295, "여행통장", 88000],
    ["내용", "금액(원)", "날짜"], ["서점", 45000, 46295],
  ], { origin: "C3" });
  XLSX.utils.book_append_sheet(workbook, sheet, "표");
  const text = await decodeSpreadsheetWorkbookBytes(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
  assert.match(text, /서울식당,2026-09-30,12000,,2026-09-30,여행통장,88000/);
  assert.match(text, /서점,45000,2026-09-30/, "Late and shifted tables retain their own date columns");
  console.log("PASS Korean document fidelity: CP949 holdings, scoped workbook dates in both epochs, quantities/IDs, snapshot dates/currencies and PDF OCR decisions.");
}
verifyWorkbooks().catch(error => { console.error(error); process.exitCode = 1; });
