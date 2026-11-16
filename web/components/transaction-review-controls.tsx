"use client";

import { getTransactionReviewReasons, type TransactionReviewReasonInput } from "@/lib/transaction-review-reasons";

type Props = {
  transaction: TransactionReviewReasonInput & { isExcluded: boolean };
  busy?: boolean;
  editing?: boolean;
  onToggle: () => void;
  onReview: () => void;
  onEdit: () => void;
};

export function TransactionReviewControls({ transaction, busy, editing, onToggle, onReview, onEdit }: Props) {
  const reasons = getTransactionReviewReasons(transaction);
  return <section className="transaction-review-controls" aria-label="Totals and review">
    <button className="button button-secondary button-small" type="button" disabled={busy}
      aria-pressed={transaction.isExcluded} onClick={onToggle}>
      {transaction.isExcluded ? "Include in totals" : "Ignore from totals"}
    </button>
    {!editing && reasons.length > 0 ? <div className="detail-warning-box">
      <strong>Review warning</strong>
      <ul>{reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
      <div className="detail-warning-actions">
        <button className="button button-primary button-small" type="button" disabled={busy} onClick={onReview}>Mark reviewed</button>
        <button className="button button-secondary button-small" type="button" disabled={busy} onClick={onEdit}>Edit details</button>
      </div>
    </div> : null}
  </section>;
}
