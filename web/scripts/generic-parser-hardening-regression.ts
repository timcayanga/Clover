import assert from "node:assert/strict";
import { guessCategoryFallback } from "@/lib/data-engine";
import { parseGenericBankStatementText, parseImportText, type ParsedImportRow } from "@/lib/import-parser";
import { getSharedMerchantCategoryHint } from "@/lib/merchant-category-hints";
import { getTransactionReviewReasons } from "@/lib/transaction-review-reasons";

const findRow = (rows: ParsedImportRow[], description: RegExp) => {
  const row = rows.find((candidate) => description.test(candidate.description ?? candidate.merchantRaw ?? ""));
  assert.ok(row, `Expected row matching ${description}`);
  return row;
};

const assertGenericParserHardening = () => {
  const multiAccountStatement = `
Example Global Bank
Statement Period: 01/01/2026 - 01/31/2026
Currency: PHP

Account Number: 1111-2222-3333
Opening Balance 100.00
Date Description Debit Credit Balance
01/05/2026 Cash Deposit 0.00 50.00 150.00
01/07/2026 ATM Withdrawal 20.00 0.00 130.00
Ending Balance 130.00

Account Number: 4444-5555-6666
Opening Balance 200.00
Date Description Debit Credit Balance
01/10/2026 Incoming Transfer 0.00 70.00 270.00
01/12/2026 Outgoing Transfer 30.00 0.00 240.00
Ending Balance 240.00
`;

  const parsedMulti = parseGenericBankStatementText(multiAccountStatement, { institution: "Example Global Bank" });
  assert.ok(parsedMulti, "Expected multi-account generic statement to parse.");
  assert.equal(parsedMulti.rows.length, 4, "Expected all rows across both accounts.");
  assert.deepEqual(
    Array.from(new Set(parsedMulti.rows.map((row) => row.accountNumber))).sort(),
    ["1111-2222-3333", "4444-5555-6666"],
    "Expected rows to retain their source account numbers."
  );
  assert.equal(findRow(parsedMulti.rows, /ATM Withdrawal/i).type, "expense");
  assert.equal(findRow(parsedMulti.rows, /Incoming Transfer/i).categoryName, "Transfers");
  assert.equal(findRow(parsedMulti.rows, /Outgoing Transfer/i).type, "expense");

  const internationalStatement = `
Contoso Bank
Statement Period: 01.01.2026 to 31.01.2026
Account Number: 99887766
Opening Balance EUR 10.000,00
Date Details Money In Money Out Balance
05.01.2026 SEPA Transfer In EUR 1.234,56 EUR 0,00 EUR 11.234,56
12.01.2026 Card Purchase EUR 0,00 EUR 34,50 EUR 11.200,06
31.01.2026 Interest EUR 0,44 EUR 0,00 EUR 11.200,50
Ending Balance EUR 11.200,50
`;

  const parsedInternational = parseGenericBankStatementText(internationalStatement, { institution: "Contoso Bank" });
  assert.ok(parsedInternational, "Expected international generic statement to parse.");
  assert.equal(parsedInternational.metadata.startDate?.slice(0, 10), "2026-01-01");
  assert.equal(parsedInternational.metadata.endDate?.slice(0, 10), "2026-01-31");
  assert.equal(parsedInternational.metadata.openingBalance, 10000);
  assert.equal(parsedInternational.metadata.endingBalance, 11200.5);
  assert.equal(findRow(parsedInternational.rows, /SEPA Transfer In/i).categoryName, "Transfers");
  assert.equal(findRow(parsedInternational.rows, /SEPA Transfer In/i).type, "income");
  assert.equal(findRow(parsedInternational.rows, /Card Purchase/i).type, "expense");

  const zeroDecimalCurrencyStatement = `
Tokyo Example Bank
Statement Period: 2026-02-01 to 2026-02-28
Account Number: 77778888
Opening Balance JPY 0
Date Details Money In Money Out Balance
2026-02-01 Salary JPY 150000 JPY 0 JPY 150000
2026-02-03 ATM Withdrawal JPY 0 JPY 10000 JPY 140000
Ending Balance JPY 140000
`;

  const parsedZeroDecimal = parseGenericBankStatementText(zeroDecimalCurrencyStatement, { institution: "Tokyo Example Bank" });
  assert.ok(parsedZeroDecimal, "Expected zero-decimal currency statement to parse.");
  assert.equal(parsedZeroDecimal.metadata.openingBalance, 0);
  assert.equal(parsedZeroDecimal.metadata.endingBalance, 140000);
  assert.equal(findRow(parsedZeroDecimal.rows, /Salary/i).amount, "150000.00");
  assert.equal(findRow(parsedZeroDecimal.rows, /ATM Withdrawal/i).type, "expense");

  const parenthesizedDebitStatement = `
Northwind Credit Union
Statement Period: 03/01/2026 - 03/31/2026
Account Number: 55556666
Opening Balance USD 1,000.00
Date Description Amount Balance
03/05/2026 Grocery Market (USD 50.00) USD 950.00
03/06/2026 Payroll USD 500.00 USD 1,450.00
Ending Balance USD 1,450.00
`;

  const parsedParenthesized = parseGenericBankStatementText(parenthesizedDebitStatement, { institution: "Northwind Credit Union" });
  assert.ok(parsedParenthesized, "Expected parenthesized debit statement to parse.");
  assert.equal(findRow(parsedParenthesized.rows, /Grocery Market/i).type, "expense");
  assert.equal(findRow(parsedParenthesized.rows, /Grocery Market/i).amount, "50.00");
  assert.equal(findRow(parsedParenthesized.rows, /Payroll/i).type, "income");

  const debitCreditMarkerStatement = `
Marker First Bank
Statement Period: 03/01/2026 - 03/31/2026
Account Number: 10101010
Opening Balance USD 1,000.00
Date Description Amount Balance
03/08/2026 Card Purchase USD 25.00 DR USD 975.00
03/09/2026 Payroll USD 100.00 CR USD 1,075.00
Ending Balance USD 1,075.00
`;

  const parsedDebitCreditMarkers = parseGenericBankStatementText(debitCreditMarkerStatement, { institution: "Marker First Bank" });
  assert.ok(parsedDebitCreditMarkers, "Expected generic statement with DR/CR amount markers to parse.");
  assert.equal(findRow(parsedDebitCreditMarkers.rows, /Card Purchase/i).type, "expense");
  assert.equal(findRow(parsedDebitCreditMarkers.rows, /Payroll/i).type, "income");
  assert.equal(findRow(parsedDebitCreditMarkers.rows, /Card Purchase/i).amount, "25.00");
  assert.equal(findRow(parsedDebitCreditMarkers.rows, /Payroll/i).amount, "100.00");

  const weakOcrStatement = `
Noisy Sample Bank
Statement Period: 04/01/2026 - 04/30/2026
Account Number: 99990000
Date Description Amount
04/01/2026 POS Purchase 10.00
04/02/2026 Transfer Out 20.00
`;

  const parsedWeakOcr = parseGenericBankStatementText(weakOcrStatement, { institution: "Noisy Sample Bank" });
  assert.ok(parsedWeakOcr, "Expected weak OCR-style statement to parse enough for review.");
  assert.equal(parsedWeakOcr.rows.length, 2);
  const reviewDetails = parsedWeakOcr.rows.flatMap((row) => {
    const rawPayload = row.rawPayload ?? {};
    return Array.isArray(rawPayload.genericReviewReasonDetails) ? rawPayload.genericReviewReasonDetails : [];
  });
  assert.ok(
    reviewDetails.some((detail) => typeof detail === "object" && detail !== null && "code" in detail),
    "Expected coded generic review reasons for weak OCR/table shape."
  );
  const displayedWeakReasons = getTransactionReviewReasons({
    reviewStatus: "pending_review",
    categoryName: parsedWeakOcr.rows[0]?.categoryName ?? null,
    parserConfidence: parsedWeakOcr.rows[0]?.parserConfidence ?? null,
    categoryConfidence: parsedWeakOcr.rows[0]?.categoryConfidence ?? null,
    merchantRaw: parsedWeakOcr.rows[0]?.merchantRaw ?? null,
    merchantClean: parsedWeakOcr.rows[0]?.merchantClean ?? null,
    rawPayload: parsedWeakOcr.rows[0]?.rawPayload,
  });
  assert.ok(
    displayedWeakReasons.some((reason) => /balance|column|amount|OCR|transaction/i.test(reason)),
    "Expected generic parser review details to surface through transaction review reasons."
  );
  assert.ok(
    parsedWeakOcr.rows.every((row) => (row.confidence ?? 100) < 70),
    "Expected weak amount-only generic rows to stay below auto-confirm confidence."
  );

  const splitLineOcrStatement = `
Scan Recovery Bank
Statement Period: 05/01/2026 - 05/31/2026
Account Number: 1234567890
Opening Balance 1,000.00
Date Description Debit Credit Balance
05/01/2026
Cash Deposit
0.00 250.00
1,250.00
05/02/2026
ATM Withdrawal
100.00 0.00
1,150.00
Ending Balance 1,150.00
`;

  const parsedSplitLine = parseGenericBankStatementText(splitLineOcrStatement, { institution: "Scan Recovery Bank" });
  assert.ok(parsedSplitLine, "Expected split-line OCR statement to parse.");
  assert.equal(parsedSplitLine.rows.length, 2, "Expected split date/description/amount lines to stitch into rows.");
  assert.equal(findRow(parsedSplitLine.rows, /Cash Deposit/i).type, "income");
  assert.equal(findRow(parsedSplitLine.rows, /ATM Withdrawal/i).type, "expense");
  assert.equal(parsedSplitLine.metadata.endingBalance, 1150);

  const ambiguousTransferStatement = `
Review First Bank
Statement Period: 06/01/2026 - 06/30/2026
Account Number: 33334444
Opening Balance 2,000.00
Date Description Amount Balance
06/03/2026 Payment to Bank 500.00 1,500.00
Ending Balance 1,500.00
`;

  const parsedAmbiguousTransfer = parseGenericBankStatementText(ambiguousTransferStatement, { institution: "Review First Bank" });
  assert.ok(parsedAmbiguousTransfer, "Expected ambiguous transfer statement to parse.");
  const ambiguousTransfer = findRow(parsedAmbiguousTransfer.rows, /Payment to Bank/i);
  assert.equal(ambiguousTransfer.type, "transfer");
  assert.ok((ambiguousTransfer.confidence ?? 100) < 70, "Expected ambiguous transfer row to stay below auto-confirm confidence.");
  const ambiguousDetails = Array.isArray(ambiguousTransfer.rawPayload?.genericReviewReasonDetails)
    ? ambiguousTransfer.rawPayload.genericReviewReasonDetails
    : [];
  assert.ok(
    ambiguousDetails.some(
      (detail) =>
        typeof detail === "object" &&
        detail !== null &&
        "code" in detail &&
        detail.code === "transfer_counterparty_unverified"
    ),
    "Expected ambiguous generic transfer to include a counterparty review reason."
  );
  const displayedAmbiguousReasons = getTransactionReviewReasons({
    reviewStatus: "pending_review",
    categoryName: ambiguousTransfer.categoryName ?? null,
    parserConfidence: ambiguousTransfer.parserConfidence ?? null,
    categoryConfidence: ambiguousTransfer.categoryConfidence ?? null,
    merchantRaw: ambiguousTransfer.merchantRaw ?? null,
    merchantClean: ambiguousTransfer.merchantClean ?? null,
    rawPayload: ambiguousTransfer.rawPayload,
  });
  assert.ok(
    displayedAmbiguousReasons.includes("Transfer counterparty could not be verified as another Clover account."),
    "Expected generic transfer counterparty reason to be visible in review display reasons."
  );

  const repeatedDateOcrStatement = `
Repeated Date Bank
Statement Period: 07/01/2026 - 07/31/2026
Account Number: 22223333
Opening Balance 1,000.00
Date Description Debit Credit Balance
07/05/2026
POS Purchase 100.00 0.00 900.00
Cash Deposit 0.00 200.00 1,100.00
Ending Balance 1,100.00
`;

  const parsedRepeatedDate = parseGenericBankStatementText(repeatedDateOcrStatement, { institution: "Repeated Date Bank" });
  assert.ok(parsedRepeatedDate, "Expected repeated-date OCR statement to parse.");
  assert.equal(parsedRepeatedDate.rows.length, 2, "Expected same-date continuation lines to split into separate transactions.");
  assert.equal(findRow(parsedRepeatedDate.rows, /POS Purchase/i).type, "expense");
  assert.equal(findRow(parsedRepeatedDate.rows, /Cash Deposit/i).type, "income");
  assert.equal(parsedRepeatedDate.metadata.endingBalance, 1100);

const unfamiliarScreenshotRows = parseImportText(
    `
Example Bank
Account details
Savings Account ****1234
Available balance PHP 12,345.67
Home
Accounts
`,
    "renamed-capture.png",
    "image/png"
  );
  assert.equal(unfamiliarScreenshotRows.length, 1, "Expected an unfamiliar screenshot to remain visible as one snapshot.");
assert.equal(unfamiliarScreenshotRows[0]?.rawPayload?.kind, "account_snapshot_marker");

const unfamiliarPortfolioRows = parseImportText(
  `My portfolio
Holdings
Acme Global Equity Fund
12.5 units
$1,250.00
Northstar Stock
3 shares
$450.00`,
  "IMG_9999.PNG",
  "image/png",
  { institution: "Unknown Broker" }
);
assert.equal(unfamiliarPortfolioRows.length, 2, "Unfamiliar portfolios should preserve visible holdings for review.");
assert.deepEqual(
  unfamiliarPortfolioRows.map((row) => row.rawPayload?.investmentName),
  ["Acme Global Equity Fund", "Northstar Stock"]
);
assert.deepEqual(
  unfamiliarPortfolioRows.map((row) => row.rawPayload?.marketValue),
  [1250, 450]
);
assert.ok(unfamiliarPortfolioRows.every((row) => row.rawPayload?.reviewRequired === true));
  assert.equal(unfamiliarScreenshotRows[0]?.rawPayload?.reviewRequired, true);
  assert.equal(unfamiliarScreenshotRows[0]?.rawPayload?.balance, 12345.67);
  assert.ok((unfamiliarScreenshotRows[0]?.confidence ?? 100) < 70, "Expected unfamiliar screenshot snapshots to require review.");

  const unfamiliarAccountOverviewRows = parseImportText(
    `
Your products
Savings account
12-34-56 12345678
GBP 100.00
Current account
34-56-78 87654321
GBP 250.00
`,
    "Screenshot_123.png",
    "image/png"
  );
  assert.equal(unfamiliarAccountOverviewRows.length, 2, "Expected unfamiliar account-list screenshots to preserve each visible product.");
  assert.deepEqual(
    unfamiliarAccountOverviewRows.map((row) => row.rawPayload?.kind),
    ["account_snapshot_marker", "account_snapshot_marker"]
  );
  assert.deepEqual(
    unfamiliarAccountOverviewRows.map((row) => row.rawPayload?.balance),
    [100, 250]
  );
  assert.ok(
    unfamiliarAccountOverviewRows.every((row) => row.rawPayload?.reviewRequired === true),
    "Expected account-list snapshots to require confirmation."
  );

  const unfamiliarMobileTransactionRows = parseImportText(
    `
Unknown Wallet
Transactions
Friday, 01 May 2026
Coffee Shop
-£4.50
Saturday, 02 May 2026
Salary payment
+£100.00
`,
    "Screenshot_123.png",
    "image/png",
    { institution: "Unknown Wallet", accountName: "Wallet" }
  );
  assert.equal(unfamiliarMobileTransactionRows.length, 2, "Expected unfamiliar mobile transaction blocks to remain visible.");
  assert.deepEqual(
    unfamiliarMobileTransactionRows.map((row) => row.description),
    ["Coffee Shop", "Salary payment"]
  );
  assert.ok(
    unfamiliarMobileTransactionRows.every((row) => row.rawPayload?.reviewRequired === true && (row.confidence ?? 100) < 70),
    "Expected unfamiliar mobile transactions to remain review-only."
  );

  assert.equal(getSharedMerchantCategoryHint("Maria Harman"), "Transfers", "Expected person-like names to map to Transfers.");
  assert.equal(getSharedMerchantCategoryHint("Visa Provisioning Service"), "Shopping", "Expected provisioning checks to map to Shopping.");
  assert.equal(getSharedMerchantCategoryHint("Great Ocean Road Choc"), "Travel & Lifestyle");
  assert.equal(guessCategoryFallback("Toby's Estate Coffee AUD PHP", "expense"), "Food & Dining");
  assert.equal(guessCategoryFallback("HTG Ticket Sales GBP", "expense"), "Entertainment");
  assert.equal(guessCategoryFallback("Citibank IRE FIN S", "income"), "Transfers");
};

assertGenericParserHardening();
console.log("Generic parser hardening regression passed.");
