import assert from "node:assert/strict";
import { detectStatementMetadata, parseImportText } from "@/lib/import-parser";

const overviewScreenshotText = `10:18
Regular Savings Balance As Of 10:18 AM
PHP 300,000.00
My Accounts
GSave
...6972
PHP 0.00
#UNOready
...4132
PHP 300,000.00`;

const overviewOcrScreenshotText = `10:18 \\ all T
GSave
REGULAR SAVINGS BALANCE AS OF 10:18 AM
£300,000.00
Hub My Savings FAQ
My Accounts
GSave
>| Account No.: ¥*¥*¥******¥%6972 >
CiMB PHP 0.00
#UNOready
(Ue) Account No; ¥*¥*¥****%*¥%4132 >
BA PHP 300,000.00
Auto Deposit Need Help?`;

const productListScreenshotText = `UNO Digital Bank
SAVINGS ACCOUNTS
#UNOready@GCash
Account Number: XXXX4132
0.00
Available Balance
DEPOSIT ACCOUNTS
#UNOboost@GCash
XXXX1330
100,000.00
#UNOboost@GCash
XXXX2023
100,000.00
#UNOboost@GCash
XXXX4217
100,000.00`;

const detailScreenshotText = `UNO Digital Bank
Time Deposit Account Details
Name TIMOTHY GUNTHER CAYANGA
Product #UNOboost@GCash
Detail Account 40001000551330 Number
Deposit # 100,000.00 Amount
Interest Rate 6.00% per annum
Tenure 12 Months
Maturity # 106,000.00 Amount
Maturity # 6000.0 Interest
Maturity Rollover Principal Instruction
Maturity 07 Oct 2026 Date
Payout Acc 30008998394132 No`;

const overviewMetadata = detectStatementMetadata(overviewScreenshotText, "IMG_1407.PNG");
assert.equal(overviewMetadata?.institution, "GSave");
assert.equal(overviewMetadata?.accountType, "bank");

const overviewRows = parseImportText(overviewScreenshotText, "IMG_1407.PNG", "image/png", { institution: "GSave" });
assert.equal(overviewRows.length, 2, "GSave overview screenshot should create two hidden account snapshots.");
assert.deepEqual(
  overviewRows.map((row) => row.accountName),
  ["GSave CIMB 6972", "GSave #UNOready 4132"]
);
assert.ok(
  overviewRows.every((row) => row.rawPayload?.kind === "account_snapshot_marker"),
  "Overview screenshot rows should stay hidden snapshot markers."
);

const overviewOcrRows = parseImportText(overviewOcrScreenshotText, "IMG_1407.PNG", "image/png", { institution: "GSave" });
assert.equal(overviewOcrRows.length, 2, "OCR-noisy GSave overview screenshot should still create two hidden account snapshots.");
assert.deepEqual(
  overviewOcrRows.map((row) => row.accountName),
  ["GSave CIMB 6972", "GSave #UNOready 4132"]
);
assert.deepEqual(
  overviewOcrRows.map((row) => row.rawPayload?.statementEndingBalance),
  [0, 300000]
);

const listMetadata = detectStatementMetadata(productListScreenshotText, "IMG_1408.PNG");
assert.equal(listMetadata?.institution, "GSave");
assert.equal(listMetadata?.accountType, "investment");
assert.equal(listMetadata?.endingBalance, 300000);

const listRows = parseImportText(productListScreenshotText, "IMG_1408.PNG", "image/png", { institution: "GSave" });
assert.equal(listRows.length, 4, "UNO list screenshot should expose one savings account and three time deposits.");
assert.deepEqual(
  listRows.map((row) => row.accountName),
  [
    "GSave #UNOready 4132",
    "GSave #UNOboost 1330",
    "GSave #UNOboost 2023",
    "GSave #UNOboost 4217",
  ]
);
assert.deepEqual(
  listRows.map((row) => row.rawPayload?.accountType),
  ["bank", "investment", "investment", "investment"]
);

const detailMetadata = detectStatementMetadata(detailScreenshotText, "IMG_1409.PNG");
assert.equal(detailMetadata?.institution, "GSave");
assert.equal(detailMetadata?.accountType, "investment");
assert.equal(detailMetadata?.accountNumber, "40001000551330");
assert.equal(detailMetadata?.accountName, "GSave #UNOboost 1330");
assert.equal(detailMetadata?.openingBalance, 100000);
assert.equal(detailMetadata?.endingBalance, 100000);
assert.equal(detailMetadata?.endDate?.slice(0, 10), "2026-10-07");

const detailRows = parseImportText(detailScreenshotText, "IMG_1409.PNG", "image/png", { institution: "GSave" });
assert.equal(detailRows.length, 1, "UNO detail screenshot should stay a single snapshot row.");
assert.equal(detailRows[0]?.accountName, "GSave #UNOboost 1330");
assert.equal(detailRows[0]?.accountNumber, "40001000551330");
assert.equal(detailRows[0]?.rawPayload?.depositAmount, 100000);
assert.equal(detailRows[0]?.rawPayload?.maturityAmount, 106000);
assert.equal(detailRows[0]?.rawPayload?.maturityInterest, 6000);
assert.equal(detailRows[0]?.rawPayload?.maturityDate, "2026-10-07");
assert.equal(detailRows[0]?.rawPayload?.payoutAccountNumber, "30008998394132");
assert.match(String(detailRows[0]?.rawPayload?.note ?? ""), /Interest rate 6\.00% per annum/i);

console.log("[PASS] GSave / UNO screenshots resolve to savings and time-deposit account snapshots.");
