"use client";

import { useEffect } from "react";
import type { FinancialCommitmentSummary } from "@/lib/commitments";
import { commitmentKindLabels, commitmentRecurrenceLabels, commitmentStatusLabels } from "@/lib/commitments";
import { formatCurrencyAmount } from "@/lib/currency-format";

const detailDateFormatter = new Intl.DateTimeFormat("en-PH", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

const formatDetailDate = (value: string | null) => {
  if (!value) return "No due date";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : detailDateFormatter.format(date);
};

export function RecurringCalendarDetail({
  commitment,
  occurrenceDate,
  onClose,
}: {
  commitment: FinancialCommitmentSummary;
  occurrenceDate: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    document.body.setAttribute("data-recurring-calendar-detail", "true");
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.removeAttribute("data-recurring-calendar-detail");
    };
  }, [onClose]);

  const amount = commitment.amount !== null && Number.isFinite(Number(commitment.amount))
    ? formatCurrencyAmount(Number(commitment.amount), commitment.currency)
    : "No amount set";
  const dueDate = occurrenceDate;
  const accountName = commitment.account?.name ?? commitment.inferredAccount?.name ?? "Not linked";

  return (
    <div className="recurring-calendar-detail" role="presentation" onClick={onClose}>
      <article
        className="recurring-calendar-detail__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recurring-calendar-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="recurring-calendar-detail__header">
          <button type="button" className="recurring-calendar-detail__back" onClick={onClose} aria-label="Back to recurring calendar">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <div>
            <span>Recurring payment details</span>
            <h2 id="recurring-calendar-detail-title">{commitment.title}</h2>
          </div>
          <button type="button" className="recurring-calendar-detail__close" onClick={onClose} aria-label="Close payment details">×</button>
        </header>

        <div className="recurring-calendar-detail__hero">
          <span>{commitment.kind === "receivable" ? "Expected" : "Due"} {formatDetailDate(dueDate)}</span>
          <strong>{amount}</strong>
          {commitment.counterparty ? <small>{commitment.counterparty}</small> : null}
        </div>

        <dl className="recurring-calendar-detail__facts">
          <div><dt>Type</dt><dd>{commitmentKindLabels[commitment.kind]}</dd></div>
          <div><dt>Repeats</dt><dd>{commitmentRecurrenceLabels[commitment.recurrence]}</dd></div>
          <div><dt>Status</dt><dd>{commitmentStatusLabels[commitment.status]}</dd></div>
          <div><dt>Account</dt><dd>{accountName}</dd></div>
          <div><dt>Category</dt><dd>{commitment.categoryName ?? "Other"}</dd></div>
          <div><dt>Currency</dt><dd>{commitment.currency}</dd></div>
        </dl>

        {commitment.notes ? (
          <section className="recurring-calendar-detail__notes">
            <span>Notes</span>
            <p>{commitment.notes}</p>
          </section>
        ) : null}
      </article>
    </div>
  );
}
