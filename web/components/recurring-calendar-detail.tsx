"use client";

import { InterfaceIcon } from "@/components/interface-icon";

import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { FinancialCommitmentSummary } from "@/lib/commitments";
import {
  commitmentKindOptions,
  commitmentRecurrenceOptions,
  commitmentStatusOptions,
} from "@/lib/commitments";
import { formatCurrencyAmount } from "@/lib/currency-format";
import { formatAccountOptionLabel } from "@/lib/account-option-label";

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

export type RecurringDetailEditableField =
  | "notes"
  | "title"
  | "amount"
  | "kind"
  | "recurrence"
  | "status"
  | "categoryName"
  | "currency"
  | "accountId"
  | "dueDate"
  | "plannedPaymentDate";

type SelectOption = { value: string; label: string };

type RecurringCalendarDetailProps = {
  commitment: FinancialCommitmentSummary;
  occurrenceDate: string;
  accountOptions: Array<{ id: string; name: string; institution: string | null; currency: string }>;
  categoryOptions: string[];
  currencyOptions: string[];
  transactionOptions: Array<{ id: string; date: string; amount: string; currency: string; merchantRaw: string; merchantClean: string | null; account: { id: string; name: string } }>;
  saving: boolean;
  onSaveChanges: (changes: Partial<Record<RecurringDetailEditableField, string>>) => Promise<boolean>;
  onClose: () => void;
  onDelete?: () => void;
  onComplete?: (completed: boolean) => void;
  completing?: boolean;
};

export function RecurringCalendarDetail({
  commitment: savedCommitment,
  occurrenceDate,
  accountOptions,
  categoryOptions,
  currencyOptions,
  transactionOptions,
  saving,
  onSaveChanges,
  onClose,
  onDelete, onComplete, completing,
}: RecurringCalendarDetailProps) {
  const [pending, setPending] = useState<Partial<Record<RecurringDetailEditableField, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState("");
  const commitment = { ...savedCommitment, ...pending } as FinancialCommitmentSummary;
  const [editingField, setEditingField] = useState<RecurringDetailEditableField | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !editingField) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    document.body.setAttribute("data-recurring-calendar-detail", "true");
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.removeAttribute("data-recurring-calendar-detail");
    };
  }, [editingField, onClose]);

  const amount = commitment.amount !== null && Number.isFinite(Number(commitment.amount))
    ? formatCurrencyAmount(Number(commitment.amount), commitment.currency)
    : "No amount set";
  const accountValue = commitment.accountId ?? commitment.inferredAccountId ?? "";

  const beginEdit = (field: RecurringDetailEditableField, value: string) => {
    if (saving || submitting) return;
    setEditingField(field);
    setDraft(value);
  };

  const finishEdit = async (field: RecurringDetailEditableField, value = draft) => {
    setPending(current => ({ ...current, [field]: value }));
    setEditingField(null);
  };

  const handleInputKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement>,
    field: RecurringDetailEditableField,
  ) => {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key === "Escape") {
      event.preventDefault();
      setEditingField(null);
    }
  };

  const renderSelect = (
    field: RecurringDetailEditableField,
    value: string,
    label: string,
    options: SelectOption[],
  ) => (
    <div className={editingField === field ? "is-editing" : undefined}>
      <dt>{label}</dt>
      <dd>
        {editingField === field ? (
          <select
            className="recurring-calendar-detail__select"
            value={draft}
            autoFocus
            disabled={saving}
            onChange={(event) => {
              const nextValue = event.currentTarget.value;
              setDraft(nextValue);
              void finishEdit(field, nextValue);
            }}
            onBlur={() => setEditingField(null)}
          >
            {options.map((option) => <option key={option.value || "none"} value={option.value}>{option.label}</option>)}
          </select>
        ) : (
          <button type="button" className="recurring-calendar-detail__editable" onClick={() => beginEdit(field, value)}>
            {options.find((option) => option.value === value)?.label ?? (value || "Not set")}
          </button>
        )}
      </dd>
    </div>
  );
  const renderDate = (field: "dueDate" | "plannedPaymentDate", value: string | null, label: string) => (
    <div className={editingField === field ? "is-editing" : undefined}>
      <dt>{label}</dt>
      <dd>
        {editingField === field ? (
          <input
            className="recurring-calendar-detail__select"
            type="date"
            value={draft}
            autoFocus
            max={field === "plannedPaymentDate" ? commitment.dueDate?.slice(0, 10) : undefined}
            disabled={saving}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onBlur={() => void finishEdit(field)}
            onKeyDown={(event) => handleInputKeyDown(event, field)}
          />
        ) : (
          <button type="button" className="recurring-calendar-detail__editable" onClick={() => beginEdit(field, value?.slice(0, 10) ?? "")}>
            {formatDetailDate(value)}
          </button>
        )}
      </dd>
    </div>
  );

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
            <span>{saving ? "Saving changes…" : "Recurring payment details"}</span>
            {editingField === "title" ? (
              <input
                id="recurring-calendar-detail-title"
                className="recurring-calendar-detail__title-input"
                value={draft}
                autoFocus
                disabled={saving}
                aria-label="Payment name"
                onChange={(event) => setDraft(event.currentTarget.value)}
                onBlur={() => void finishEdit("title")}
                onKeyDown={(event) => handleInputKeyDown(event, "title")}
              />
            ) : (
              <h2 id="recurring-calendar-detail-title">
                <button type="button" className="recurring-calendar-detail__editable" onClick={() => beginEdit("title", commitment.title)}>
                  {commitment.title}
                </button>
              </h2>
            )}
          </div>
          <button type="button" className="recurring-calendar-detail__close" onClick={onClose} aria-label="Close payment details"><InterfaceIcon name="close" /></button>
        </header>

        <div className="recurring-calendar-detail__hero">
          <span>{commitment.plannedPaymentDate ? "Planned payment" : commitment.kind === "receivable" ? "Expected" : "Due"} {formatDetailDate(occurrenceDate)}</span>
          {editingField === "amount" ? (
            <input
              className="recurring-calendar-detail__amount-input"
              value={draft}
              autoFocus
              inputMode="decimal"
              disabled={saving}
              aria-label="Payment amount"
              onChange={(event) => setDraft(event.currentTarget.value)}
              onBlur={() => void finishEdit("amount")}
              onKeyDown={(event) => handleInputKeyDown(event, "amount")}
            />
          ) : (
            <strong>
              <button type="button" className="recurring-calendar-detail__editable" onClick={() => beginEdit("amount", commitment.amount ?? "")}>
                {amount}
              </button>
            </strong>
          )}
          {commitment.counterparty ? <small>{commitment.counterparty}</small> : null}
        </div>

        <dl className="recurring-calendar-detail__facts">
          {renderDate("dueDate", commitment.dueDate, "Due date")}
          {renderDate("plannedPaymentDate", commitment.plannedPaymentDate, "Planned payment")}
          {!commitment.tracking ? renderSelect("kind", commitment.kind, "Type", commitmentKindOptions) : null}
          {renderSelect("recurrence", commitment.recurrence, "Repeats", commitmentRecurrenceOptions)}
          {renderSelect("status", commitment.status, "Status", commitmentStatusOptions)}
          {renderSelect("accountId", accountValue, "Account", [
            { value: "", label: "Not linked" },
            ...accountOptions.map((account) => ({
              value: account.id,
              label: formatAccountOptionLabel(account),
            })),
          ])}
          {renderSelect("categoryName", commitment.categoryName ?? "", "Category", [
            { value: "", label: "Other" },
            ...categoryOptions.map((category) => ({ value: category, label: category })),
          ])}
          {renderSelect("currency", commitment.currency, "Currency", currencyOptions.map((currency) => ({ value: currency, label: currency })))}
        </dl>

        {commitment.tracking ? <dl className="recurring-calendar-detail__facts">
          {commitment.tracking.paymentAmount !== null ? <div><dt>Payment amount</dt><dd>{formatCurrencyAmount(commitment.tracking.paymentAmount, commitment.currency)}</dd></div> : null}
          {commitment.tracking.totalPayments !== null ? <><div><dt>Total payments</dt><dd>{commitment.tracking.totalPayments}</dd></div><div><dt>Payments already made</dt><dd>{commitment.tracking.paymentsMade}</dd></div></> : null}
          <div><dt>Remind me</dt><dd>{commitment.tracking.reminderDays === null ? "No reminder" : `${commitment.tracking.reminderDays} days before`}</dd></div>
          {commitment.tracking.endDate ? <div><dt>Ends</dt><dd>{commitment.tracking.endDate}</dd></div> : null}
          {commitment.tracking.reference ? <div><dt>Reference</dt><dd>{commitment.tracking.reference}</dd></div> : null}
        </dl> : null}

        {commitment.evidenceTransactionIds.length > 0 ? (
          <section className="recurring-calendar-detail__notes recurring-saved-evidence">
            <span>Transaction history</span>
            {commitment.evidenceTransactionIds.map((transactionId) => {
              const transaction = transactionOptions.find((option) => option.id === transactionId);
              if (!transaction) return null;
              const merchant = transaction.merchantClean ?? transaction.merchantRaw;
              const amount = formatCurrencyAmount(Math.abs(Number(transaction.amount)), transaction.currency);
              return <p key={transactionId}>{merchant} · {amount} · {formatDetailDate(transaction.date)} · {transaction.account.name}</p>;
            })}
          </section>
        ) : null}

        <label className="recurring-calendar-detail__notes"><span>Notes</span><textarea className="settings-textarea" aria-label="Notes" value={commitment.notes ?? ""} onChange={event => setPending(current => ({ ...current, notes: event.target.value }))}/></label>
        <footer className="recurring-detail-actions">
          {saveError ? <p role="alert">{saveError}</p> : null}
          {onComplete && commitment.status !== "resolved" ? <label><input type="checkbox" checked={Boolean(commitment.occurrenceCompletedAt)} disabled={completing || submitting || Object.keys(pending).length > 0} onChange={event => onComplete(event.target.checked)}/> Mark this payment as complete</label> : null}
          {onDelete ? <button type="button" className="button button-danger" onClick={onDelete}>Delete recurring</button> : null}
          <button type="button" className="button button-primary" disabled={submitting || saving} onClick={async () => {
            setSaveError("");
            if (pending.title !== undefined && !pending.title.trim()) { setSaveError("Name is required."); return; }
            setSubmitting(true);
            try {
              if (!await onSaveChanges(pending)) return;
              setPending({});
              onClose();
            } finally { setSubmitting(false); }
          }}>{submitting ? "Saving…" : "Save changes"}</button>
        </footer>
      </article>
    </div>
  );
}
