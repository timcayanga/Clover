import assert from "node:assert/strict";
import { reconcileStatementTransactionYears } from "../lib/import-date-reconciliation";

const corrected = reconcileStatementTransactionYears({
  sourceMetadata: {
    startDate: "2025-12-01T12:00:00.000Z",
    endDate: "2025-12-31T12:00:00.000Z",
  },
  resolvedMetadata: {},
  rows: [
    {
      date: "2026-12-08",
      amount: "125.00",
      merchantRaw: "Coffee Shop",
      type: "expense",
      rawPayload: { line: "Dec 08 Coffee Shop 125.00" },
    },
  ],
});

assert.equal(corrected[0]?.date, "2025-12-08");
assert.equal(
  (corrected[0]?.rawPayload as Record<string, unknown>)?.dateYearReconciliation != null,
  true
);

const explicitYearPreserved = reconcileStatementTransactionYears({
  sourceMetadata: {
    startDate: "2025-12-01T12:00:00.000Z",
    endDate: "2025-12-31T12:00:00.000Z",
  },
  resolvedMetadata: {},
  rows: [
    {
      date: "2026-12-08",
      amount: "125.00",
      merchantRaw: "Explicitly dated adjustment",
      type: "expense",
      rawPayload: { line: "Dec 08, 2026 Explicitly dated adjustment 125.00" },
    },
  ],
});

assert.equal(explicitYearPreserved[0]?.date, "2026-12-08");

const crossYear = reconcileStatementTransactionYears({
  sourceMetadata: {
    startDate: "2025-12-15T12:00:00.000Z",
    endDate: "2026-01-14T12:00:00.000Z",
  },
  resolvedMetadata: {},
  rows: [
    {
      date: "2026-12-20",
      amount: "50.00",
      merchantRaw: "December purchase",
      type: "expense",
      rawPayload: { sourceLine: "12/20 December purchase 50.00" },
    },
    {
      date: "2025-01-05",
      amount: "75.00",
      merchantRaw: "January purchase",
      type: "expense",
      rawPayload: { sourceLine: "01/05 January purchase 75.00" },
    },
  ],
});

assert.deepEqual(
  crossYear.map((row) => row.date),
  ["2025-12-20", "2026-01-05"]
);

console.log("Import date reconciliation regression checks passed.");
