"use client";

import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { FinancialCommitmentSummary } from "@/lib/commitments";
import {
  commitmentKindOptions,
  commitmentRecurrenceOptions,
  commitmentStatusOptions,
} from "@/lib/commitments";
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

export type RecurringDetailEditableField =
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
  accountOptions: Array<{ id: string; name: string; institution: string | null }>;
  categoryOptions: string[];
  currencyOptions: string[];
  transactionOptions: Array<{ id: string; date: string; amount: string; currency: string; merchantRaw: string; merchantClean: string | null; account: { id: string; name: string } }>;
  saving: boolean;
  onSaveField: (field: RecurringDetailEditableField, value: string) => Promise<boolean>;
  onClose: () => void;
};

export function RecurringCalendarDetail({
  commitment,
  occurrenceDate,
  accountOptions,
  categoryOptions,
  currencyOptions,
  transactionOptions,
  saving,
  onSaveField,
  onClose,
}: RecurringCalendarDetailProps) {
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
    if (saving) return;
    setEditingField(field);
    setDraft(value);
  };

  const finishEdit = async (field: RecurringDetailEditableField, value = draft) => {
    const saved = await onSaveField(field, value);
    if (saved) setEditingField(null);
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
          <button type="button" className="recurring-calendar-detail__close" onClick={onClose} aria-label="Close payment details">×</button>
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
          {renderSelect("kind", commitment.kind, "Type", commitmentKindOptions)}
          {renderSelect("recurrence", commitment.recurrence, "Repeats", commitmentRecurrenceOptions)}
          {renderSelect("status", commitment.status, "Status", commitmentStatusOptions)}
          {renderSelect("accountId", accountValue, "Account", [
            { value: "", label: "Not linked" },
            ...accountOptions.map((account) => ({
              value: account.id,
              label: account.institution ? `${account.name} · ${account.institution}` : account.name,
            })),
          ])}
          {renderSelect("categoryName", commitment.categoryName ?? "", "Category", [
            { value: "", label: "Other" },
            ...categoryOptions.map((category) => ({ value: category, label: category })),
          ])}
          {renderSelect("currency", commitment.currency, "Currency", currencyOptions.map((currency) => ({ value: currency, label: currency })))}
        </dl>

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
