import assert from "node:assert/strict";
import { parseGenericBankStatementText, type ParsedImportRow } from "@/lib/import-parser";

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
};

assertGenericParserHardening();
console.log("Generic parser hardening regression passed.");
