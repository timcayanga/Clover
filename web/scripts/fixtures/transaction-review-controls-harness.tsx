// Test-only synthetic state; renders the actual detail controls without financial APIs.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { TransactionReviewControls } from "../../components/transaction-review-controls";
import { transactionNeedsReview } from "../../lib/transaction-review-reasons";
const fixture = { isExcluded: true, reviewStatus: "pending_review", categoryId: "food", categoryName: "Food", merchantRaw: "Lunch", parserConfidence: 98, categoryConfidence: 98, isTransfer: true, amount: "500", accountId: "fixture" };
function Harness() {
  const [row, setRow] = useState(fixture);
  const [editing, setEditing] = useState(false);
  return <main style={{maxWidth: 480, margin: "24px auto", padding: 20}}>
    <h1>Transaction Details</h1><p>Fixture transfer · PHP500</p>
    <TransactionReviewControls transaction={row} editing={editing}
      onToggle={() => setRow(current => ({ ...current, isExcluded: !current.isExcluded, reviewStatus: "edited" }))}
      onReview={() => setRow(current => ({ ...current, reviewStatus: "confirmed" }))}
      onEdit={() => setEditing(true)} />
    <output aria-label="Review state">{JSON.stringify({ needsReview: transactionNeedsReview(row), ignored: row.isExcluded, transfer: row.isTransfer, editing })}</output>
    <button type="button" onClick={() => { setRow(fixture); setEditing(false); }}>Reset fixture</button>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Harness />);
