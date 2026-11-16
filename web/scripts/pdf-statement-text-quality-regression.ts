import assert from "node:assert/strict";
import { assessPdfStatementTextPage, canReplacePdfStatementTextPage, hasCompletePdfNativeLedger, hasPdfStatementLedgerHeader } from "../lib/pdf-statement-text-quality";

const heading = "Date Description Amount";
const complete = `${heading}\n2026-10-01 Payroll +2,000.00\n2026-10-03 Groceries -100.00`;
const missingDescription = complete.replace("Groceries ", "");
const missingAmount = complete.replace(" -100.00", "");
const broken = `${heading}\n2026-10-01\n2026-10-03\nPayroll\nGroceries\n+2,000.00\n-100.00`;

assert(hasPdfStatementLedgerHeader(complete));
assert.deepEqual(assessPdfStatementTextPage(complete, false), []);
assert.deepEqual(assessPdfStatementTextPage("Statement cover\n2026-10-01", true), []);
assert.deepEqual(assessPdfStatementTextPage(missingDescription, false), ["missing_description"]);
assert.deepEqual(assessPdfStatementTextPage(missingAmount, false), ["incomplete_row"]);
assert.deepEqual(assessPdfStatementTextPage(broken, false), ["broken_columns"]);
assert(hasCompletePdfNativeLedger([complete]));
assert(hasCompletePdfNativeLedger([complete, "2026-10-04 Coffee -25.00"]));
assert(!hasCompletePdfNativeLedger([complete, "Page 2 of 2"]));
assert(!hasCompletePdfNativeLedger([complete, missingDescription]));
assert(!hasCompletePdfNativeLedger([broken]));
for (const damaged of [missingDescription, missingAmount, broken]) {
  assert(canReplacePdfStatementTextPage(damaged, complete));
  assert(!canReplacePdfStatementTextPage(damaged, complete + "\n2026-10-04 Coffee -25.00"));
  assert(!canReplacePdfStatementTextPage(damaged, complete.replace("Payroll", "Interest")));
  assert(!canReplacePdfStatementTextPage(damaged, ""));
}
assert(!canReplacePdfStatementTextPage(missingDescription, complete.replace("-100.00", "+100.00")));
assert(!canReplacePdfStatementTextPage(broken, complete.replace("-100.00", "-101.00")));
console.log("PDF text-layer quality regression passed.");
