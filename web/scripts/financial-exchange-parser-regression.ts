import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { isSupportedImportFile, validateImportFileBytes } from "@/lib/import-file-validation";
import { parseFinancialExchangeImport, parseImportText } from "@/lib/import-parser";

const ofx = `OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<CURDEF>USD
<BANKACCTFROM><BANKID>021000021<ACCTID>99887766</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260830120000<TRNAMT>-12.50<FITID>abc-1<NAME>GUAM BAKERY<MEMO>Receipt purchase</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260831120000<TRNAMT>1000.00<FITID>abc-2<NAME>PAYROLL</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

const ofxRows = parseImportText(ofx, "checking.ofx", "application/x-ofx", { institution: "Example Bank" });
assert.equal(ofxRows.length, 2);
assert.equal(ofxRows[0]?.date, "2026-08-30");
assert.equal(ofxRows[0]?.amount, "12.5");
assert.equal(ofxRows[0]?.currency, "USD");
assert.equal(ofxRows[0]?.type, "expense");
assert.equal(ofxRows[0]?.merchantClean, "Guam Bakery");
assert.equal(ofxRows[0]?.institution, "Example Bank");
assert.equal((ofxRows[0]?.rawPayload as { bankId?: string }).bankId, "021000021");
assert.equal(ofxRows[1]?.type, "income");
assert.equal((ofxRows[0]?.rawPayload as { fitId?: string }).fitId, "abc-1");

const qif = `!Type:Bank
D8/29'26
T-45.67
PNeighborhood Market
MGroceries
LFood & Dining
N1001
^
D8/30'26
T500.00
PPayroll
LIncome
^`;
const qifRows = parseFinancialExchangeImport(qif, "transactions.qif", "application/qif", {
  accountName: "Checking",
  currency: "USD",
});
assert.equal(qifRows?.length, 2);
assert.equal(qifRows?.[0]?.date, "2026-08-29");
assert.equal(qifRows?.[0]?.amount, "45.67");
assert.equal(qifRows?.[0]?.type, "expense");
assert.equal(qifRows?.[0]?.accountName, "Checking");
assert.equal(qifRows?.[1]?.type, "income");

const mt940 = `:20:STARTUMSE
:25:DE89370400440532013000
:28C:00001/001
:60F:C260101EUR1000,00
:61:2601020102D12,50NTRFNONREF//ref-1
:86:?00GUAM BAKERY?20Receipt purchase
:61:2601030103C500,00NMSCNONREF//ref-2
:86:?00PAYROLL?20Monthly salary
:62F:C260103EUR1487,50
:20:SECONDSTATEMENT
:25:GB12BARC20000055779911
:60F:C260201GBP200,00
:61:260202D20,00NCHGNONREF
ACCOUNT SERVICE CHARGE
:62F:C260202GBP180,00`;
const mt940Rows = parseFinancialExchangeImport(mt940, "statement.mt940", "application/x-mt940", {});
assert.equal(mt940Rows?.length, 3);
assert.equal(mt940Rows?.[0]?.date, "2026-01-02");
assert.equal(mt940Rows?.[0]?.amount, "12.5");
assert.equal(mt940Rows?.[0]?.currency, "EUR");
assert.equal(mt940Rows?.[0]?.type, "transfer");
assert.equal(mt940Rows?.[0]?.accountNumber, "DE89370400440532013000");
assert.equal(mt940Rows?.[1]?.date, "2026-01-03");
assert.equal(mt940Rows?.[1]?.type, "income");
assert.equal(mt940Rows?.[2]?.accountNumber, "GB12BARC20000055779911");
assert.equal(mt940Rows?.[2]?.currency, "GBP");
assert.equal(mt940Rows?.[2]?.amount, "20");

const citiMt940 = `:20:asdfsdfdsf
:25:123456789
:28:1/1
:60F:C240312USD17376,67
:61:240312    DD212,39NMSCNONREF//
/ABC/DEF/MISCELLANEOUS
:86:/PT/FT/PY/SOMETHING FOO BAR 112233
:61:240312    CD0,00NDEFNONREF//
:61:240312    DD561,08NDEFNONREF//
/ABC/DEF/MISCELLANEOUS
:62F:C240312USD16233,92`;
const citiRows = parseFinancialExchangeImport(citiMt940, "citi.mt940", "application/x-mt940", { institution: "Citi" });
assert.equal(citiRows?.length, 2, "blank-padded MT940 entry dates should parse while zero-value rows stay excluded");
assert.deepEqual(citiRows?.map((row) => row.amount), ["212.39", "561.08"]);
assert.ok(citiRows?.every((row) => row.currency === "USD" && row.type === "expense"));

const camt = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
  <BkToCstmrStmt><Stmt><Acct><Id><IBAN>DE89370400440532013000</IBAN></Id><Ccy>EUR</Ccy></Acct>
    <Ntry><Amt Ccy="EUR">24.90</Amt><CdtDbtInd>DBIT</CdtDbtInd><BookgDt><Dt>2026-02-04</Dt></BookgDt><NtryDtls><TxDtls><Refs><EndToEndId>purchase-1</EndToEndId></Refs><RmtInf><Ustrd>Neighborhood Market groceries</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>
    <Ntry><Amt Ccy="EUR">850.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><BookgDt><Dt>2026-02-05</Dt></BookgDt><AddtlNtryInf>Payroll deposit</AddtlNtryInf></Ntry>
  </Stmt></BkToCstmrStmt>
</Document>`;
const camtRows = parseFinancialExchangeImport(camt, "statement.xml", "application/xml", {});
assert.equal(camtRows?.length, 2);
assert.equal(camtRows?.[0]?.date, "2026-02-04");
assert.equal(camtRows?.[0]?.amount, "24.9");
assert.equal(camtRows?.[0]?.currency, "EUR");
assert.equal(camtRows?.[0]?.type, "expense");
assert.equal(camtRows?.[0]?.accountNumber, "DE89370400440532013000");
assert.equal((camtRows?.[0]?.rawPayload as { reference?: string }).reference, "purchase-1");
assert.equal(camtRows?.[0]?.institution, undefined, "a BIC must remain provenance rather than becoming a display bank name");
assert.equal(camtRows?.[0]?.parserConfidence, 100);
assert.equal(camtRows?.[1]?.type, "income");

const camtBatch = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt>
  <Stmt><Acct><Id><IBAN>DE14740618130000033626</IBAN></Id><Ccy>EUR</Ccy><Ownr><Nm>Test Account Owner</Nm></Ownr><Svcr><FinInstnId><BIC>GENODEF1PFK</BIC><Nm>VR-Bank Example</Nm></FinInstnId></Svcr></Acct>
    <Ntry><Amt Ccy="EUR">6.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><BookgDt><Dt>2013-12-27</Dt></BookgDt><NtryRef>batch-1</NtryRef><NtryDtls>
      <TxDtls><Refs><EndToEndId>batch-item-1</EndToEndId></Refs><AmtDtls><TxAmt><Amt Ccy="EUR">3.50</Amt></TxAmt></AmtDtls><RmtInf><Ustrd>First batch transfer</Ustrd></RmtInf></TxDtls>
      <TxDtls><Refs><EndToEndId>batch-item-2</EndToEndId></Refs><AmtDtls><TxAmt><Amt Ccy="EUR">2.50</Amt></TxAmt></AmtDtls><RmtInf><Ustrd>Second batch transfer</Ustrd></RmtInf></TxDtls>
    </NtryDtls></Ntry>
  </Stmt>
  <Stmt><Acct><Id><Othr><Id>USD-OPERATING-42</Id><SchmeNm><Cd>BBAN</Cd></SchmeNm></Othr></Id><Ccy>USD</Ccy></Acct>
    <Ntry><Amt Ccy="USD">11.25</Amt><CdtDbtInd>CRDT</CdtDbtInd><ValDt><Dt>2013-12-28</Dt></ValDt><AddtlNtryInf>Refund received</AddtlNtryInf></Ntry>
  </Stmt>
</BkToCstmrStmt></Document>`;
const camtBatchRows = parseFinancialExchangeImport(camtBatch, "batch.xml", "application/xml", {});
assert.equal(camtBatchRows?.length, 3, "a reconciled CAMT batch should split into its detailed transactions");
assert.deepEqual(camtBatchRows?.slice(0, 2).map((row) => row.amount), ["3.5", "2.5"]);
assert.deepEqual(camtBatchRows?.slice(0, 2).map((row) => row.accountNumber), ["DE14740618130000033626", "DE14740618130000033626"]);
assert.equal(camtBatchRows?.[0]?.accountName, "Test Account Owner");
assert.equal(camtBatchRows?.[0]?.institution, "VR-Bank Example");
assert.equal((camtBatchRows?.[0]?.rawPayload as { batchDetailIndex?: number }).batchDetailIndex, 1);
assert.equal((camtBatchRows?.[1]?.rawPayload as { batchDetailCount?: number }).batchDetailCount, 2);
assert.equal(camtBatchRows?.[2]?.accountNumber, "USD-OPERATING-42", "CAMT non-IBAN IDs must exclude scheme metadata");
assert.equal(camtBatchRows?.[2]?.currency, "USD");
assert.equal(camtBatchRows?.[2]?.type, "income");

const financialJson = JSON.stringify({
  bankName: "Example Credit Union",
  accountName: "Everyday Checking",
  accountNumber: "11223344",
  currency: "USD",
  transactions: [
    { transaction_date: "2026-03-01", transactionName: "Guam Bakery", debit_amount: "18.25", categoryName: "Food & Dining", confidence: 0.95, parserConfidence: 0.9, categoryConfidence: 88 },
    { bookingDate: "2026-03-02", normalizedName: "Employer Payroll", transactionAmount: 1200, type: "credit" },
  ],
});
const jsonRows = parseFinancialExchangeImport(financialJson, "transactions.json", "application/json", {});
assert.equal(jsonRows?.length, 2);
assert.equal(jsonRows?.[0]?.date, "2026-03-01");
assert.equal(jsonRows?.[0]?.amount, "18.25");
assert.equal(jsonRows?.[0]?.type, "expense");
assert.equal(jsonRows?.[0]?.institution, "Example Credit Union");
assert.equal(jsonRows?.[0]?.accountName, "Everyday Checking");
assert.equal(jsonRows?.[0]?.confidence, 95);
assert.equal(jsonRows?.[0]?.parserConfidence, 90);
assert.equal(jsonRows?.[0]?.categoryConfidence, 88);
assert.equal(jsonRows?.[1]?.date, "2026-03-02");
assert.equal(jsonRows?.[1]?.type, "income");

const realJsonFixture = process.env.CLOVER_FINANCIAL_JSON_FIXTURE ??
  "/Users/TimCayanga1/Documents/Bank Statements/Samples/UCPB/Philippines-UCPB-Statement.json";
if (existsSync(realJsonFixture)) {
  const realRows = parseFinancialExchangeImport(readFileSync(realJsonFixture, "utf8"), "Philippines-UCPB-Statement.json", "application/json", {});
  assert.equal(realRows?.length, 24, "the real UCPB JSON fixture should preserve all non-zero transactions");
  assert.ok(realRows?.every((row) => row.date && Number(row.amount) > 0 && row.merchantClean));
}

assert.equal(isSupportedImportFile("export.ofx", "application/x-ofx"), true);
assert.equal(isSupportedImportFile("export.qfx", "application/vnd.intu.qfx"), true);
assert.equal(isSupportedImportFile("export.qif", "application/qif"), true);
assert.equal(isSupportedImportFile("export.mt940", "application/x-mt940"), true);
assert.equal(isSupportedImportFile("statement.xml", "application/xml"), true);
assert.equal(isSupportedImportFile("transactions.json", "application/json"), true);
assert.equal(
  validateImportFileBytes({ fileName: "export.ofx", contentType: "application/x-ofx", bytes: new TextEncoder().encode(ofx) }),
  null
);
assert.match(
  String(validateImportFileBytes({ fileName: "export.qif", contentType: "application/qif", bytes: new TextEncoder().encode("not qif") })),
  /recognized financial export/i
);
assert.equal(
  validateImportFileBytes({ fileName: "statement.mt940", contentType: "application/x-mt940", bytes: new TextEncoder().encode(mt940) }),
  null
);
assert.equal(
  validateImportFileBytes({ fileName: "statement.xml", contentType: "application/xml", bytes: new TextEncoder().encode(camt) }),
  null
);
assert.equal(
  validateImportFileBytes({ fileName: "transactions.json", contentType: "application/json", bytes: new TextEncoder().encode(financialJson) }),
  null
);
assert.match(
  String(validateImportFileBytes({ fileName: "notes.json", contentType: "application/json", bytes: new TextEncoder().encode('{"message":"hello"}') })),
  /recognized financial export/i
);
const workerSource = readFileSync(new URL("../workers/import-processor.ts", import.meta.url), "utf8");
const fileTextSource = readFileSync(new URL("../lib/import-file-text.server.ts", import.meta.url), "utf8");
assert.match(
  fileTextSource,
  /readImportedFileTextWithCacheInfo[\s\S]{0,12000}?\(\?:ofx\|qfx\|qif\|mt940\|sta\|xml\|json\)[\s\S]{0,500}?TextDecoder/,
  "queued financial exports should be decoded as text instead of entering the PDF reader"
);
assert.match(
  workerSource,
  /const hasFinancialExchangeRows =[\s\S]{0,800}?kind === "financial_exchange_transaction"/,
  "the worker should recognize exchange rows as deterministic financial data"
);
assert.match(
  workerSource,
  /const shouldRunOpenAiFallback =[\s\S]{0,180}?\!hasFinancialExchangeRows/,
  "deterministic financial exchange imports must never consume backup-parser tokens"
);
assert.match(
  workerSource,
  /isJsonImportFile\(fileType, fileName\) && isExplicitJsonTrainingFile\(text, fileName\)/,
  "ordinary transaction JSON exports must create transactions instead of being consumed as parser-training bundles"
);
assert.match(
  workerSource,
  /structuredExportExplicitlyNonCash[\s\S]{0,500}?explicitFinancialExchangeCategory[\s\S]{0,800}?!structuredExportExplicitlyNonCash[\s\S]{0,200}?isAtmCashWithdrawalCandidate/,
  "an explicit non-cash category in a structured JSON export must not create an inferred Cash mirror"
);

console.log("Financial exchange OFX, QFX, QIF, MT940, CAMT.053, and JSON parser regression passed.");
