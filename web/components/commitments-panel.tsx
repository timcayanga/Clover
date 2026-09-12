"use client";

import { RecurringDashboard } from "@/components/recurring-dashboard";
import { RecurringCreateForm } from "@/components/recurring-create-form";
import { recurringCompletionDate } from "@/lib/recurring-tracking";
import { InterfaceIcon } from "@/components/interface-icon";

import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CurrencySelector } from "@/components/currency-selector";
import {
  commitmentRecurrenceOptions,
  type FinancialCommitmentSummary,
} from "@/lib/commitments";
import type { RecurringPatternSummary } from "@/lib/recurring-page";
import type { PlannedPaymentSuggestion } from "@/lib/planned-payment-suggestions";
import { getCurrencyCatalogCodes } from "@/lib/currencies";
import { capturePostHogClientEvent } from "@/components/posthog-analytics";
import { CategoryBrandMark } from "@/components/category-brand-mark";
import { RecurringCalendarDetail, type RecurringDetailEditableField } from "@/components/recurring-calendar-detail";
import { suggestRecurringTitle, getRecurringSuggestionCategory } from "@/lib/recurring-suggestion-policy";
import { formatAccountOptionLabel } from "@/lib/account-option-label";

type CommitmentAccountOption = {
  id: string;
  name: string;
  institution: string | null;
  type: string;
  currency: string;
};

type CommitmentTransactionOption = {
  category?: { name: string } | null;
  id: string;
  date: string;
  amount: string;
  currency: string;
  merchantRaw: string;
  merchantClean: string | null;
  account: {
    id: string;
    name: string;
  };
};

type CommitmentsPanelProps = {
  workspaceId: string;
  commitments: FinancialCommitmentSummary[];
  recurringPatterns: RecurringPatternSummary[];
  plannedPaymentSuggestions: PlannedPaymentSuggestion[];
  accounts: CommitmentAccountOption[];
  categoryOptions: string[];
  transactions: CommitmentTransactionOption[];
  activeTab?: "overview" | "planned" | "debt" | "owed" | "installments";
  initialKind?: CommitmentKind;
  showAddModal?: boolean;
  creationPage?: boolean;
  onCloseAdd?: () => void;
};

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "2-digit",
  year: "numeric",
});

type CommitmentKind = "planned_payment" | "debt" | "receivable" | "reminder";
type EditableCommitmentField = RecurringDetailEditableField | "counterparty" | "notes";

const reasonBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 999,
  border: "1px solid rgba(3, 168, 192, 0.18)",
  padding: "4px 10px",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "capitalize",
  color: "var(--accent)",
  background: "rgba(3, 168, 192, 0.08)",
};

const formatCurrency = (value: string | null, currency = "PHP") => {
  if (!value) {
    return "No amount set";
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return value;
  }

  try {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(numeric);
  } catch {
    return currencyFormatter.format(numeric);
  }
};

const formatDate = (value: string | null) => {
  if (!value) {
    return "No date yet";
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : dateFormatter.format(parsed);
};

const getRecurringSuggestionIdentity = (pattern: RecurringPatternSummary) => {
  const title = (pattern.merchantClean ?? pattern.merchantRaw)
    .trim()
    .toLowerCase()
    .replace(/\b(subscription|subscr(?:iption)?|premium|monthly|annual|membership|billspay)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${pattern.currency.trim().toUpperCase() || "PHP"}::${title}`;
};

const toDateInputValue = (value: string | null) => {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
};

const formatTransactionLabel = (transaction: CommitmentTransactionOption) => {
  const merchant = transaction.merchantClean ?? transaction.merchantRaw;
  const amount = Number(transaction.amount);
  const amountLabel = Number.isFinite(amount)
    ? new Intl.NumberFormat("en-PH", { style: "currency", currency: transaction.currency || "PHP" }).format(Math.abs(amount))
    : transaction.amount;
  return `${merchant} · ${amountLabel} · ${dateFormatter.format(new Date(transaction.date))}`;
};

export function CommitmentsPanel({
  workspaceId,
  commitments,
  recurringPatterns,
  plannedPaymentSuggestions,
  accounts,
  categoryOptions,
  transactions,
  activeTab = "overview",
  initialKind = "planned_payment",
  showAddModal = false,
  creationPage = false,
  onCloseAdd,
}: CommitmentsPanelProps) {
  const router = useRouter();
  const [allReviews, setAllReviews] = useState(false);
  const [confirmingPatternId, setConfirmingPatternId] = useState<string | null>(null);
  const [dismissingPatternId, setDismissingPatternId] = useState<string | null>(null);
  const [dismissedPatternIds, setDismissedPatternIds] = useState<Set<string>>(() => new Set());
  const [reviewingSuggestion, setReviewingSuggestion] = useState<{
    id: string;
    sourceKind: "recurring_pattern" | PlannedPaymentSuggestion["sourceKind"];
    title: string;
    counterparty: string;
    amount: string;
    currency: string;
    dueDate: string;
    plannedPaymentDate: string;
    recurrence: (typeof commitmentRecurrenceOptions)[number]["value"];
    accountId: string;
    notes: string;
    sourceLabel: string;
    sourceDetail: string | null;
    reasonSummary: string | null;
    reasonTags: string[];
    statementCheckpointId: string | null;
    installmentTerms: string;
    transactionIds: string[];
  } | null>(null);
  const [patternDraft, setPatternDraft] = useState({
    title: "",
    counterparty: "",
    amount: "",
    currency: "PHP",
    dueDate: "",
    plannedPaymentDate: "",
    recurrence: "monthly" as (typeof commitmentRecurrenceOptions)[number]["value"],
    accountId: "",
    notes: "",
    statementCheckpointId: "",
    installmentTerms: "",
    transactionIds: [] as string[],
  });
  const [transactionSearch, setTransactionSearch] = useState("");
  const [visibleCommitments, setVisibleCommitments] = useState(commitments);
  const [savingCommitmentId, setSavingCommitmentId] = useState<string | null>(null);
  const [completingCommitmentId, setCompletingCommitmentId] = useState<string | null>(null);
  const [calendarDetail, setCalendarDetail] = useState<{ commitmentId: string; occurrenceDate: string } | null>(null);

  useEffect(() => {
    setVisibleCommitments(commitments);
  }, [commitments]);

  // Home counts recurring-transaction suggestions as potential payments, so
  // the Recurring overview must expose the same records for review.
  const actionablePlannedPaymentSuggestions = plannedPaymentSuggestions.filter((suggestion) => !dismissedPatternIds.has(suggestion.id));
  const suggestedRecurringPatterns = useMemo(() => {
    const deduped = new Map<string, RecurringPatternSummary>();
    for (const pattern of recurringPatterns) {
      if (dismissedPatternIds.has(pattern.id)) {
        continue;
      }
      if (actionablePlannedPaymentSuggestions.some(suggestion => suggestion.currency === pattern.currency && suggestion.transactionIds.some(id => pattern.transactionIds.includes(id)))) continue;
      const alreadyAdded = visibleCommitments.some((commitment) => {
        const commitmentTitle = `${commitment.title} ${commitment.counterparty ?? ""}`.trim().toLowerCase();
        const patternName = (pattern.merchantClean ?? pattern.merchantRaw).trim().toLowerCase();
        return commitmentTitle.includes(patternName) || patternName.includes(commitment.title.trim().toLowerCase());
      });
      if (alreadyAdded) {
        continue;
      }

      const key = getRecurringSuggestionIdentity(pattern);
      const existing = deduped.get(key);
      if (!existing || pattern.confidence > existing.confidence || pattern.transactionCount > existing.transactionCount) {
        deduped.set(key, pattern);
      }
    }
    return Array.from(deduped.values());
  }, [dismissedPatternIds, recurringPatterns, visibleCommitments, plannedPaymentSuggestions]);
  const currencyCatalogCodes = useMemo(() => getCurrencyCatalogCodes(), []);
  const transactionById = useMemo(() => new Map(transactions.map((transaction) => [transaction.id, transaction])), [transactions]);
  const addableTransactions = useMemo(() => {
    const search = transactionSearch.trim().toLowerCase();
    if (!search) return [];
    return transactions
      .filter((transaction) => !patternDraft.transactionIds.includes(transaction.id))
      .filter((transaction) => {
        return `${transaction.merchantClean ?? ""} ${transaction.merchantRaw} ${transaction.account.name} ${transaction.amount} ${transaction.date}`.toLowerCase().includes(search);
      })
      .slice(0, 8);
  }, [patternDraft.accountId, patternDraft.currency, patternDraft.transactionIds, transactionSearch, transactions]);
  const addKindForActiveTab: CommitmentKind =
    activeTab === "debt" ? "debt" : activeTab === "owed" ? "receivable" : activeTab === "installments" ? "reminder" : activeTab === "planned" ? "planned_payment" : initialKind;
  const openRecurringAdd = () => {
    window.dispatchEvent(new CustomEvent("clover:open-recurring-add", { detail: { kind: addKindForActiveTab } }));
  };

  const handleDelete = async (commitmentId: string) => {
    if (!window.confirm("Delete this recurring item?")) {
      return;
    }

    try {
      const response = await fetch(`/api/commitments/${commitmentId}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Unable to delete commitment");
      }

      setVisibleCommitments((current) => current.filter((commitment) => commitment.id !== commitmentId));
      if (calendarDetail?.commitmentId === commitmentId) setCalendarDetail(null);
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete commitment";
      window.alert(message);
    }
  };

  const handleOccurrenceCompletion = async (commitment: FinancialCommitmentSummary, completed: boolean) => {
    if (!commitment.occurrenceDueDate || commitment.id.startsWith("optimistic-")) {
      return;
    }

    setCompletingCommitmentId(commitment.id);
    try {
      const response = await fetch(`/api/commitments/${commitment.id}/completion`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dueDate: commitment.occurrenceDueDate, completed }),
      });
      const payload = (await response.json().catch(() => null)) as {
        completedAt?: string | null;
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to update this payment");
      }

      setVisibleCommitments((current) => current.map((item) =>
        item.id === commitment.id
          ? { ...item, occurrenceCompletedAt: completed ? payload?.completedAt ?? new Date().toISOString() : null,
              completedPaymentDates: completed ? [...new Set([...(item.completedPaymentDates ?? []), commitment.occurrenceDueDate!])] : (item.completedPaymentDates ?? []).filter(date => date !== commitment.occurrenceDueDate),
              completedPaymentCount: Math.max(0, (item.completedPaymentCount ?? 0) + (completed ? (item.completedPaymentDates?.includes(commitment.occurrenceDueDate!) ? 0 : 1) : -1)) }
          : item
      ));
      capturePostHogClientEvent("recurring_occurrence_updated", {
        workspace_id: workspaceId,
        recurring_kind: commitment.kind,
        recurrence: commitment.recurrence,
        completed,
      });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Unable to update this payment");
    } finally {
      setCompletingCommitmentId(null);
    }
  };

  const saveCommitmentChanges = async (
    commitment: FinancialCommitmentSummary,
    changes: Partial<Record<EditableCommitmentField, string>>
  ): Promise<boolean> => {
    if (changes.title !== undefined && !changes.title.trim()) return false;
    if (!Object.keys(changes).length) return true;
    const values = Object.fromEntries(Object.entries(changes).map(([field,value]) => [field,value.trim() || null]));
    setSavingCommitmentId(commitment.id);
    try {
      const response = await fetch(`/api/commitments/${commitment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          ...(changes.dueDate !== undefined ? { nextDueDate: values.dueDate } : {}),
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        commitment?: FinancialCommitmentSummary;
        error?: string;
      } | null;

      if (!response.ok || !payload?.commitment) {
        throw new Error(payload?.error ?? "Unable to update recurring item");
      }

      setVisibleCommitments((current) =>
        current.map((item) => (item.id === commitment.id ? { ...item, ...payload.commitment as FinancialCommitmentSummary } : item))
      );
      router.refresh();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update recurring item";
      window.alert(message);
      return false;
    } finally {
      setSavingCommitmentId(null);
    }
  };

  const openSuggestionReview = (suggestion: {
    id: string;
    sourceKind: "recurring_pattern" | PlannedPaymentSuggestion["sourceKind"];
    title: string;
    counterparty: string;
    amount: string;
    currency: string;
    dueDate: string;
    plannedPaymentDate: string;
    recurrence: (typeof commitmentRecurrenceOptions)[number]["value"];
    accountId: string;
    notes: string;
    sourceLabel: string;
    sourceDetail: string | null;
    reasonSummary: string | null;
    reasonTags: string[];
    statementCheckpointId: string | null;
    installmentTerms: string;
    transactionIds: string[];
  }) => {
    setReviewingSuggestion(suggestion);
    setPatternDraft({
      title: suggestion.title,
      counterparty: suggestion.counterparty,
      amount: suggestion.amount,
      currency: suggestion.currency || "PHP",
      dueDate: suggestion.dueDate,
      plannedPaymentDate: suggestion.plannedPaymentDate ?? "",
      recurrence: suggestion.recurrence,
      accountId: suggestion.accountId,
      notes: suggestion.notes,
      statementCheckpointId: suggestion.statementCheckpointId ?? "",
      installmentTerms: suggestion.installmentTerms ?? "",
      transactionIds: suggestion.transactionIds,
    });
    setTransactionSearch("");
  };

  const openPatternReview = (pattern: RecurringPatternSummary) => {
    const title = suggestRecurringTitle(pattern.merchantClean ?? pattern.merchantRaw);
    const recurrenceValue = commitmentRecurrenceOptions.some((option) => option.value === pattern.frequency)
      ? (pattern.frequency as (typeof commitmentRecurrenceOptions)[number]["value"])
      : "monthly";

    openSuggestionReview({
      id: pattern.id,
      sourceKind: "recurring_pattern",
      title,
      counterparty: title,
      amount: pattern.amount ?? "",
      currency: pattern.currency ?? "PHP",
      dueDate: toDateInputValue(pattern.nextExpectedDate),
      plannedPaymentDate: "",
      recurrence: recurrenceValue,
      accountId: pattern.account?.id ?? "",
      notes: `Detected from ${pattern.transactionCount} matching transaction${pattern.transactionCount === 1 ? "" : "s"}.`,
      sourceLabel: "Recurring pattern",
      sourceDetail: pattern.nextExpectedDate ? `Next due ${formatDate(pattern.nextExpectedDate)}` : null,
      reasonSummary: pattern.reasonSummary,
      reasonTags: pattern.reasonTags,
      statementCheckpointId: "",
      installmentTerms: "",
      transactionIds: pattern.transactionIds,
    });
  };

  const openPlannedPaymentReview = (suggestion: PlannedPaymentSuggestion) => {
    openSuggestionReview({
      id: suggestion.id,
      sourceKind: suggestion.sourceKind,
      title: suggestRecurringTitle(suggestion.title),
      counterparty: suggestion.counterparty ?? suggestion.title,
      amount: suggestion.amount ?? "",
      currency: suggestion.currency,
      dueDate: toDateInputValue(suggestion.dueDate),
      plannedPaymentDate: "",
      recurrence: suggestion.recurrence,
      accountId: suggestion.accountId ?? "",
      notes: suggestion.notes ?? "",
      sourceLabel: suggestion.sourceLabel,
      sourceDetail: suggestion.sourceDetail,
      reasonSummary: suggestion.reasonSummary,
      reasonTags: suggestion.reasonTags,
      statementCheckpointId: suggestion.statementCheckpointId,
      installmentTerms: suggestion.installmentTerms ?? "",
      transactionIds: suggestion.transactionIds,
    });
  };

  const handleConfirmPattern = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reviewingSuggestion) {
      return;
    }

    setConfirmingPatternId(reviewingSuggestion.id);
    const notesToSave =
      patternDraft.installmentTerms.trim() && !patternDraft.notes.includes("Installment terms:")
        ? [patternDraft.notes.trim(), `Installment terms: ${patternDraft.installmentTerms.trim()}.`].filter(Boolean).join(" ")
        : patternDraft.notes.trim();
    const payload = {
      ...patternDraft,
      notes: notesToSave,
    };

    const request = reviewingSuggestion.sourceKind === "recurring_pattern"
      ? fetch(`/api/recurring-patterns/${reviewingSuggestion.id}/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : fetch("/api/commitments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            kind: reviewingSuggestion.sourceKind === "installment" ? "reminder" : "planned_payment",
            title: patternDraft.title,
            counterparty: patternDraft.counterparty.trim() ? patternDraft.counterparty : null,
            amount: patternDraft.amount.trim() ? patternDraft.amount : null,
            currency: patternDraft.currency.trim() || "PHP",
            dueDate: patternDraft.dueDate || null,
            plannedPaymentDate: patternDraft.plannedPaymentDate || null,
            recurrence: patternDraft.recurrence,
            notes: notesToSave || null,
            accountId: patternDraft.accountId || null,
            transactionId: null,
            evidenceTransactionIds: patternDraft.transactionIds,
            statementCheckpointId: patternDraft.statementCheckpointId || null,
            status: "active",
          }),
        });

    void request
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as { commitment?: FinancialCommitmentSummary; error?: string } | null;
        if (!response.ok) {
          throw new Error(payload?.error ?? "Unable to add recurring item");
        }

        if (payload?.commitment) {
          setVisibleCommitments((current) => [payload.commitment as FinancialCommitmentSummary, ...current.filter((item) => item.id !== payload.commitment?.id)]);
        }

        capturePostHogClientEvent("recurring_item_confirmed", {
          workspace_id: workspaceId,
          source_kind: reviewingSuggestion.sourceKind,
          recurrence: patternDraft.recurrence,
          has_amount: Boolean(patternDraft.amount.trim()),
        });

        setReviewingSuggestion(null);
        router.refresh();
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Unable to add recurring item";
        window.alert(message);
      })
      .finally(() => {
        setConfirmingPatternId(null);
      });
  };

  const handleDismissPattern = (patternId: string) => {
    setDismissingPatternId(patternId);
    setDismissedPatternIds((current) => new Set(current).add(patternId));
    const isPattern = reviewingSuggestion?.sourceKind === "recurring_pattern";
    void fetch(isPattern ? `/api/recurring-patterns/${patternId}/dismiss` : "/api/recurring-suggestions/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, suggestionId: patternId }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? "Unable to hide recurring suggestion");
        }

        capturePostHogClientEvent("recurring_item_reviewed", {
          workspace_id: workspaceId,
          action: "dismissed",
        });

        setReviewingSuggestion(null);
        router.refresh();
      })
      .catch((error: unknown) => {
        setDismissedPatternIds((current) => {
          const next = new Set(current);
          next.delete(patternId);
          return next;
        });
        const message = error instanceof Error ? error.message : "Unable to hide recurring suggestion";
        window.alert(message);
      })
      .finally(() => {
        setDismissingPatternId(null);
      });
  };

  const calendarDetailCommitment = calendarDetail
    ? visibleCommitments.find((commitment) => commitment.id === calendarDetail.commitmentId) ?? null
    : null;

  return (
    <section style={{ display: "grid", gap: 24 }}>
      <RecurringDashboard
        key={`${workspaceId}-${activeTab}`}
        items={visibleCommitments}
        tab={activeTab}
        reviewCount={actionablePlannedPaymentSuggestions.length + suggestedRecurringPatterns.length}
        onOpen={(item, date) => setCalendarDetail({ commitmentId: item.id, occurrenceDate: date })}
        onAdd={openRecurringAdd}
        onDelete={(id) => void handleDelete(id)}
        review={<>        <article className="panel recurring-overview-card recurring-overview-card--list recurring-overview-card--review">
          <div className="recurring-overview-card__heading">
            <div>
              <p className="eyebrow">Review suggestions</p>
              <small>Potential recurring transactions found in your transaction history</small>
            </div>
          </div>
          {actionablePlannedPaymentSuggestions.length > 0 || suggestedRecurringPatterns.length > 0 ? (
            <div className="recurring-overview-list">
              {actionablePlannedPaymentSuggestions.slice(0, allReviews ? undefined : 3).map((suggestion) => (
                <div key={suggestion.id} className="recurring-overview-list__item recurring-overview-list__item--suggestion">
                  <CategoryBrandMark categoryName={suggestion.categoryName ?? getRecurringSuggestionCategory(suggestion.transactionIds.map((id) => transactionById.get(id)?.category?.name), suggestion.reasonTags)} size={30} />
                  <span>
                    <strong>{suggestRecurringTitle(suggestion.title)}</strong>
                    <small>{suggestion.sourceLabel} · {formatCurrency(suggestion.amount, suggestion.currency)}</small>
                  </span>
                  <button className="button button-secondary button-small recurring-overview-review-button" type="button" onClick={() => openPlannedPaymentReview(suggestion)}>
                    Review
                  </button>
                </div>
              ))}
              {allReviews || actionablePlannedPaymentSuggestions.length < 3 ? suggestedRecurringPatterns.slice(0, allReviews ? undefined : Math.max(0, 3 - actionablePlannedPaymentSuggestions.length)).map((pattern) => (
                <div key={pattern.id} className="recurring-overview-list__item recurring-overview-list__item--suggestion">
                  <CategoryBrandMark categoryName={getRecurringSuggestionCategory(pattern.transactionIds.map((id) => transactionById.get(id)?.category?.name), pattern.reasonTags)} size={30} />
                  <span>
                    <strong>{suggestRecurringTitle(pattern.merchantClean ?? pattern.merchantRaw)}</strong>
                    <small>{formatDate(pattern.nextExpectedDate)} · {formatCurrency(pattern.amount, pattern.currency)}</small>
                  </span>
                  <button className="button button-secondary button-small recurring-overview-review-button" type="button" onClick={() => openPatternReview(pattern)}>
                    Review
                  </button>
                </div>
              )) : null}
            </div>
          ) : (
            <p className="recurring-overview-card__empty">Clover will show potential recurring transactions here for you to review.</p>
          )}
          {actionablePlannedPaymentSuggestions.length + suggestedRecurringPatterns.length > 3 ? <button className="button button-primary" type="button" onClick={() => setAllReviews(!allReviews)}>{allReviews ? "Show fewer" : "Review all suggestions"}</button> : null}
          <small>Suggestions stay unconfirmed until you save them.</small>
        </article></>}
      />

      {calendarDetailCommitment ? (
        <RecurringCalendarDetail
          commitment={{ ...calendarDetailCommitment, occurrenceCompletedAt: calendarDetailCommitment.completedPaymentDates?.includes(recurringCompletionDate(calendarDetailCommitment, calendarDetail!.occurrenceDate)) ? calendarDetailCommitment.occurrenceCompletedAt ?? "complete" : null }}
          occurrenceDate={calendarDetail!.occurrenceDate}
          accountOptions={accounts}
          categoryOptions={categoryOptions}
          currencyOptions={currencyCatalogCodes}
          transactionOptions={transactions}
          saving={savingCommitmentId === calendarDetailCommitment.id}
          onSaveChanges={(changes) => saveCommitmentChanges(calendarDetailCommitment, changes)}
          completing={completingCommitmentId === calendarDetailCommitment.id}
          onComplete={(completed) => void handleOccurrenceCompletion({ ...calendarDetailCommitment, occurrenceDueDate: recurringCompletionDate(calendarDetailCommitment, calendarDetail!.occurrenceDate) }, completed)}
          onDelete={() => void handleDelete(calendarDetailCommitment.id)}
          onClose={() => setCalendarDetail(null)}
        />
      ) : null}

      {reviewingSuggestion ? (
        <div
          className="recurring-add-modal"
          role="presentation"
          onClick={() => setReviewingSuggestion(null)}
        >
          <section
            className="panel glass recurring-add-modal__card recurring-suggestion-review-modal"
            style={{ width: "min(720px, 100%)", display: "grid", gap: 16, maxHeight: "min(92vh, 880px)", overflow: "auto" }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="recurring-suggestion-review-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="recurring-modal-close"
              type="button"
              onClick={() => setReviewingSuggestion(null)}
              aria-label="Close recurring suggestion review"
              data-modal-close
            >
              <InterfaceIcon name="close" size={20} />
            </button>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
              <div className="recurring-suggestion-review__intro">
                <p className="eyebrow">Review suggestion</p>
                <h3 className="recurring-suggestion-review__why" id="recurring-suggestion-review-title">Why Clover suggested this</h3>
                {reviewingSuggestion.reasonTags.length > 0 ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                    {reviewingSuggestion.reasonTags.map((tag) => (
                      <span key={tag} style={reasonBadgeStyle}>
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <form onSubmit={handleConfirmPattern} style={{ display: "grid", gap: 16 }}>
              <label className="settings-field">
                <span>Title</span>
                <input
                  className="settings-input"
                  value={patternDraft.title}
                  onChange={(event) => setPatternDraft((draft) => ({ ...draft, title: event.target.value }))}
                  required
                />
              </label>

              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                <label className="settings-field">
                  <span>Paid to</span>
                  <input
                    className="settings-input"
                    value={patternDraft.counterparty}
                    onChange={(event) => setPatternDraft((draft) => ({ ...draft, counterparty: event.target.value }))}
                    placeholder="Merchant, biller, lender, or person"
                  />
                </label>
                <label className="settings-field">
                  <span>Due date</span>
                  <input
                    className="settings-input"
                    type="date"
                    value={patternDraft.dueDate}
                    onChange={(event) => setPatternDraft((draft) => ({ ...draft, dueDate: event.target.value }))}
                  />
                </label>
                <label className="settings-field">
                  <span>Planned payment date <small>(optional)</small></span>
                  <input
                    className="settings-input"
                    type="date"
                    value={patternDraft.plannedPaymentDate}
                    max={patternDraft.dueDate || undefined}
                    onChange={(event) => setPatternDraft((draft) => ({ ...draft, plannedPaymentDate: event.target.value }))}
                  />
                  <small>Use an earlier date if you want Clover to remind you before the bill is due.</small>
                </label>
              </div>

              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                <label className="settings-field">
                  <span>Currency</span>
                  <CurrencySelector
                    value={patternDraft.currency}
                    onChange={(value) => setPatternDraft((draft) => ({ ...draft, currency: value }))}
                    options={currencyCatalogCodes}
                    ariaLabel="Select recurring suggestion currency"
                    className="settings-currency-field__selector"
                    buttonClassName="settings-currency-field__button"
                    menuClassName="settings-currency-field__menu"
                    optionClassName="settings-currency-field__option"
                    menuAlignment="end"
                  />
                </label>
                <label className="settings-field">
                  <span>Amount</span>
                  <input
                    className="settings-input"
                    inputMode="decimal"
                    value={patternDraft.amount}
                    onChange={(event) => setPatternDraft((draft) => ({ ...draft, amount: event.target.value }))}
                    placeholder="2500.00"
                  />
                </label>
              </div>

              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                <label className="settings-field">
                  <span>Repeat cadence</span>
                  <select
                    value={patternDraft.recurrence}
                    onChange={(event) =>
                      setPatternDraft((draft) => ({
                        ...draft,
                        recurrence: event.target.value as (typeof commitmentRecurrenceOptions)[number]["value"],
                      }))
                    }
                    className="settings-select"
                  >
                    {commitmentRecurrenceOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="settings-field">
                  <span>Linked account</span>
                  <select
                    value={patternDraft.accountId}
                    onChange={(event) => setPatternDraft((draft) => ({ ...draft, accountId: event.target.value }))}
                    className="settings-select"
                  >
                    <option value="">None</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {formatAccountOptionLabel(account)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <section className="recurring-suggestion-evidence" aria-labelledby="recurring-suggestion-evidence-title">
                <div className="recurring-suggestion-evidence__heading">
                  <div>
                    <span id="recurring-suggestion-evidence-title">Detected transactions</span>
                    <small>Keep only the transactions that belong to this recurring bill.</small>
                  </div>
                  <strong>{patternDraft.transactionIds.length}</strong>
                </div>
                <div className="recurring-suggestion-evidence__selected">
                  {patternDraft.transactionIds.map((transactionId) => {
                    const transaction = transactionById.get(transactionId);
                    if (!transaction) return null;
                    return (
                      <div key={transactionId} className="recurring-suggestion-evidence__row">
                        <span>{formatTransactionLabel(transaction)}</span>
                        <button
                          type="button"
                          onClick={() => setPatternDraft((draft) => ({ ...draft, transactionIds: draft.transactionIds.filter((id) => id !== transactionId) }))}
                          aria-label={`Remove ${transaction.merchantClean ?? transaction.merchantRaw}`}
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })}
                  {patternDraft.transactionIds.length === 0 ? <p>No transactions selected. Search below to add one.</p> : null}
                </div>
                <label className="settings-field">
                  <span>Add another transaction</span>
                  <input
                    className="settings-input"
                    type="search"
                    value={transactionSearch}
                    onChange={(event) => setTransactionSearch(event.currentTarget.value)}
                    placeholder="Search merchant, account, amount, or date"
                  />
                </label>
                {addableTransactions.length > 0 ? (
                  <div className="recurring-suggestion-evidence__results">
                    {addableTransactions.map((transaction) => (
                      <button
                        key={transaction.id}
                        type="button"
                        onClick={() => {
                          setPatternDraft((draft) => ({ ...draft, transactionIds: [...draft.transactionIds, transaction.id] }));
                          setTransactionSearch("");
                        }}
                      >
                        <span>{formatTransactionLabel(transaction)}</span>
                        <strong>+ Add</strong>
                      </button>
                    ))}
                  </div>
                ) : transactionSearch.trim() ? <p className="recurring-suggestion-evidence__empty">No matching transactions found.</p> : null}
              </section>

              <label className="settings-field">
                <span>Notes</span>
                <textarea
                  className="settings-textarea"
                  value={patternDraft.notes}
                  onChange={(event) => setPatternDraft((draft) => ({ ...draft, notes: event.target.value }))}
                  rows={3}
                />
              </label>

              {reviewingSuggestion.sourceKind === "installment" ? (
                <label className="settings-field">
                  <span>Installment terms</span>
                  <input
                    className="settings-input"
                    value={patternDraft.installmentTerms}
                    onChange={(event) => setPatternDraft((draft) => ({ ...draft, installmentTerms: event.target.value }))}
                    placeholder="e.g. 6 months"
                  />
                </label>
              ) : null}

              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="button button-secondary button-small recurring-compact-action" type="button" onClick={() => setReviewingSuggestion(null)}>
                    Cancel
                  </button>
                    <button
                      className="button button-secondary button-small recurring-compact-action"
                      type="button"
                      onClick={() => handleDismissPattern(reviewingSuggestion.id)}
                      disabled={dismissingPatternId !== null || confirmingPatternId !== null}
                    >
                      {dismissingPatternId === reviewingSuggestion.id ? "Hiding..." : "Not a recurring payment"}
                    </button>
                </div>
                <button className="button button-primary button-small recurring-compact-action" type="submit" disabled={confirmingPatternId !== null || dismissingPatternId !== null}>
                  {confirmingPatternId === reviewingSuggestion.id
                    ? "Saving..."
                    : reviewingSuggestion.sourceKind === "installment"
                      ? "Save installment"
                      : "Save recurring"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {showAddModal ? <RecurringCreateForm
        key={`${workspaceId}-${initialKind}`}
        workspaceId={workspaceId}
        initialKind={initialKind}
        accounts={accounts}
        categoryOptions={categoryOptions}
        creationPage={creationPage}
        onClose={() => onCloseAdd?.()}
        onSaved={(item) => { setVisibleCommitments(current => [item, ...current]); router.refresh(); }}
      /> : null}
    </section>
  );
}
