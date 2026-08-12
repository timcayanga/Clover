import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { detectStatementMetadata, parseImportText } from "@/lib/import-parser";
import { validateParsedImportRows } from "@/lib/data-engine-validation";
import { resolveImportFileExtractionCacheVersion } from "@/lib/data-engine";

const statementText = `
BPI
STATEMENT OF ACCOUNT
STATEMENT DATE JULY 27, 2026
PAYMENT DUE DATE AUGUST 17, 2026
CREDIT LIMIT 500,000.00
CUSTOMER NUMBER 12349001
TRANSACTION POST DATE DESCRIPTION AMOUNT
June 26 June 29 Paypal *Google 4029357733 604.99
July 18 July 20 Paypal *Google Youtube 4029357733 190.89
RATES AND FEES TABLE
Monthly finance charge 3.00%
July 30 July 30 Card replacement example 9999999999 7,500.00
`;

const metadata = detectStatementMetadata(statementText, "BE20260728.pdf");
assert.equal(metadata.institution, "BPI Family Savings Bank");
assert.equal(metadata.accountType, "credit_card");
assert.equal(metadata.paymentDueDate, "2026-08-17T12:00:00.000Z");
assert.equal(resolveImportFileExtractionCacheVersion("BE20260728.pdf"), "v12-bpi-card-ledger-r2");

const rows = parseImportText(statementText, "BE20260728.pdf", "application/pdf", {
  institution: metadata.institution,
  accountName: metadata.accountName,
  accountNumber: metadata.accountNumber,
});
assert.equal(rows.length, 2, "Rates-and-fees content after the ledger boundary must not become transactions.");
assert.deepEqual(
  rows.map((row) => Number(row.amount)),
  [604.99, 190.89],
  "Approval numbers and amounts must stay separate."
);
assert.ok(rows.every((row) => Number(row.amount) < 1_000_000), "BPI approval codes must never inflate amounts.");

const validation = validateParsedImportRows({
  rows,
  metadata: {
    ...metadata,
    startDate: "2026-06-29T12:00:00.000Z",
    endDate: "2026-07-20T12:00:00.000Z",
  },
});
assert.equal(validation.critical, false, JSON.stringify(validation.findings));
assert.equal(validation.metrics.outsidePeriodRate, 0);
assert.equal(validation.metrics.unsafeRowRate, 0);

void readFile(new URL("../components/global-import-activity.tsx", import.meta.url), "utf8").then((globalActivitySource) => {
  assert.match(globalActivitySource, /fetch\(`\/api\/imports\/\$\{current\.importFileId\}\/status`/);
  assert.match(globalActivitySource, /processingPhase === "repair_needed"/);
  assert.match(globalActivitySource, /errorCode: "I-104"/);
  return readFile(new URL("../workers/import-processor.ts", import.meta.url), "utf8");
}).then((workerSource) => {
  assert.match(workerSource, /resolvedMetadata\.accountType === "credit_card"/);
  assert.match(workerSource, /validateParsedImportRows\(\{ rows: rawRows, metadata: validationMetadata \}\)/);
  console.log("BPI credit-card safety regression passed.");
});
