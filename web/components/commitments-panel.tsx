"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CurrencySelector } from "@/components/currency-selector";
import {
  commitmentKindLabels,
  commitmentKindOptions,
  commitmentRecurrenceLabels,
  commitmentRecurrenceOptions,
  commitmentStatusLabels,
  type FinancialCommitmentSummary,
} from "@/lib/commitments";
import type { RecurringPatternSummary } from "@/lib/recurring-page";
import type { PlannedPaymentSuggestion } from "@/lib/planned-payment-suggestions";
import { getAccountPath } from "@/lib/account-path";
import { getCurrencyCatalogCodes } from "@/lib/currencies";
import { formatAccountTypeLabel, getRecurringKindSuggestionForAccountType, isLiabilityAccountType } from "@/lib/account-types";

type CommitmentAccountOption = {
  id: string;
  name: string;
  institution: string | null;
  type: string;
};

type CommitmentTransactionOption = {
  id: string;
  date: string;
  amount: string;
  currency: string;
  merchantRaw: string;
  merchantClean: string | null;
  account: {
    name: string;
  };
};

type CommitmentsPanelProps = {
  workspaceId: string;
  commitments: FinancialCommitmentSummary[];
  recurringPatterns: RecurringPatternSummary[];
  plannedPaymentSuggestions: PlannedPaymentSuggestion[];
  accounts: CommitmentAccountOption[];
  transactions: CommitmentTransactionOption[];
  showAddModal?: boolean;
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

const kindOrder = ["planned_payment", "debt", "receivable", "reminder"] as const;
type CommitmentKind = (typeof kindOrder)[number];
type CommitmentFormKind = CommitmentKind;

type CommitmentFormCopy = {
  eyebrow: string;
  headline: string;
  helper: string;
  titleLabel: string;
  titlePlaceholder: string;
  counterpartyLabel?: string;
  counterpartyPlaceholder?: string;
  amountLabel?: string;
  amountPlaceholder?: string;
  dueDateLabel?: string;
  recurrenceLabel?: string;
  linkedAccountLabel?: string;
  linkedAccountHelp?: string;
  transactionLabel?: string;
  notesLabel?: string;
  notesPlaceholder?: string;
  showCounterparty: boolean;
  showAmount: boolean;
  showCurrency: boolean;
  showDueDate: boolean;
  showRecurrence: boolean;
  showLinkedAccount: boolean;
  showTransaction: boolean;
  showNotes: boolean;
};

const formatCurrency = (value: string | null) => {
  if (!value) {
    return "No amount set";
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? currencyFormatter.format(numeric) : value;
};

const formatDate = (value: string | null) => {
  if (!value) {
    return "No date yet";
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : dateFormatter.format(parsed);
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
  const amountLabel = Number.isFinite(amount) ? currencyFormatter.format(amount) : transaction.amount;
  return `${merchant} · ${amountLabel} · ${dateFormatter.format(new Date(transaction.date))}`;
};

const kindBadgeTone: Record<CommitmentKind, string> = {
  planned_payment: "var(--accent)",
  debt: "var(--warn)",
  receivable: "var(--good)",
  reminder: "var(--muted)",
};

const kindRingTone: Record<CommitmentKind, string> = {
  planned_payment: "rgba(3, 168, 192, 0.22)",
  debt: "rgba(245, 158, 11, 0.24)",
  receivable: "rgba(16, 185, 129, 0.24)",
  reminder: "rgba(148, 163, 184, 0.24)",
};

const getCommitmentDateValue = (commitment: FinancialCommitmentSummary) => commitment.nextDueDate ?? commitment.dueDate;

const commitmentFormCopy: Record<CommitmentFormKind, CommitmentFormCopy> = {
  planned_payment: {
    eyebrow: "Planned payment",
    headline: "Track a future payment",
    helper: "Best for bills, subscriptions, transfers, and anything you expect to pay soon.",
    titleLabel: "Title",
    titlePlaceholder: "Rent, tuition, card payment, subscription",
    counterpartyLabel: "Payee",
    counterpartyPlaceholder: "Landlord, merchant, lender, service provider",
    amountLabel: "Amount",
    amountPlaceholder: "2500.00",
    dueDateLabel: "Due date",
    recurrenceLabel: "Repeat cadence",
    linkedAccountLabel: "Linked account",
    linkedAccountHelp: "Optional if you want Clover to anchor the reminder to an account.",
    transactionLabel: "Linked transaction",
    notesLabel: "Notes",
    notesPlaceholder: "Add context, reminders, or payoff details.",
    showCounterparty: true,
    showAmount: true,
    showCurrency: true,
    showDueDate: true,
    showRecurrence: true,
    showLinkedAccount: true,
    showTransaction: true,
    showNotes: true,
  },
  debt: {
    eyebrow: "Debt",
    headline: "Track a balance you owe",
    helper: "Good for loans, mortgages, credit cards, BNPL, and other obligations with an outstanding balance.",
    titleLabel: "Title",
    titlePlaceholder: "Mortgage, car loan, credit card, BNPL plan",
    counterpartyLabel: "Lender",
    counterpartyPlaceholder: "Bank, lender, card issuer, person",
    amountLabel: "Balance",
    amountPlaceholder: "150000.00",
    dueDateLabel: "Next due date",
    recurrenceLabel: "Payment cadence",
    linkedAccountLabel: "Linked account",
    linkedAccountHelp: "Link the matching liability account if it already exists in Accounts.",
    notesLabel: "Notes",
    notesPlaceholder: "Add payoff strategy, minimums, or reminders.",
    showCounterparty: true,
    showAmount: true,
    showCurrency: true,
    showDueDate: true,
    showRecurrence: true,
    showLinkedAccount: true,
    showTransaction: false,
    showNotes: true,
  },
  receivable: {
    eyebrow: "Receivable",
    headline: "Track money owed to you",
    helper: "Use this for reimbursements, IOUs, client balances, or any amount you expect to receive.",
    titleLabel: "Title",
    titlePlaceholder: "Reimbursement, client invoice, friend IOU",
    counterpartyLabel: "Who owes you",
    counterpartyPlaceholder: "Client, friend, employer, tenant",
    amountLabel: "Amount owed",
    amountPlaceholder: "1200.00",
    dueDateLabel: "Expected date",
    linkedAccountLabel: "Linked account",
    linkedAccountHelp: "Optional if you already track the receivable as an account.",
    notesLabel: "Notes",
    notesPlaceholder: "Add context, repayment plan, or follow-up notes.",
    showCounterparty: true,
    showAmount: true,
    showCurrency: true,
    showDueDate: true,
    showRecurrence: false,
    showLinkedAccount: true,
    showTransaction: false,
    showNotes: true,
  },
  reminder: {
    eyebrow: "Reminder",
    headline: "Add a quick reminder",
    helper: "Fastest option. Just give it a title and the date you want to remember.",
    titleLabel: "Reminder",
    titlePlaceholder: "Renew insurance, file taxes, follow up",
    dueDateLabel: "Reminder date",
    showCounterparty: false,
    showAmount: false,
    showCurrency: false,
    showDueDate: true,
    showRecurrence: false,
    showLinkedAccount: false,
    showTransaction: false,
    showNotes: false,
  },
};

export function CommitmentsPanel({
  workspaceId,
  commitments,
  recurringPatterns,
  plannedPaymentSuggestions,
  accounts,
  transactions,
  showAddModal = false,
  onCloseAdd,
}: CommitmentsPanelProps) {
  const router = useRouter();
  const detailPanelRef = useRef<HTMLDivElement | null>(null);
  const hasMountedRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmingPatternId, setConfirmingPatternId] = useState<string | null>(null);
  const [dismissingPatternId, setDismissingPatternId] = useState<string | null>(null);
  const [reviewingSuggestion, setReviewingSuggestion] = useState<{
    id: string;
    sourceKind: "recurring_pattern" | PlannedPaymentSuggestion["sourceKind"];
    title: string;
    counterparty: string;
    amount: string;
    currency: string;
    dueDate: string;
    recurrence: (typeof commitmentRecurrenceOptions)[number]["value"];
    accountId: string;
    notes: string;
    sourceLabel: string;
    sourceDetail: string | null;
    reasonSummary: string | null;
    statementCheckpointId: string | null;
    installmentTerms: string;
  } | null>(null);
  const [patternDraft, setPatternDraft] = useState({
    title: "",
    counterparty: "",
    amount: "",
    currency: "PHP",
    dueDate: "",
    recurrence: "monthly" as (typeof commitmentRecurrenceOptions)[number]["value"],
    accountId: "",
    notes: "",
    statementCheckpointId: "",
    installmentTerms: "",
  });
  const [kind, setKind] = useState<CommitmentKind>("planned_payment");
  const [title, setTitle] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("PHP");
  const [dueDate, setDueDate] = useState("");
  const [recurrence, setRecurrence] = useState<(typeof commitmentRecurrenceOptions)[number]["value"]>("once");
  const [notes, setNotes] = useState("");
  const [accountId, setAccountId] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [selectedKind, setSelectedKind] = useState<CommitmentKind>(() => {
    for (const entryKind of kindOrder) {
      if (commitments.some((item) => item.kind === entryKind)) {
        return entryKind;
      }
    }

    return "planned_payment";
  });

  const groupedCommitments = useMemo(
    () =>
      kindOrder.map((entryKind) => {
        const items = commitments.filter((item) => item.kind === entryKind);
        const nextDueDate = items
          .map((item) => getCommitmentDateValue(item))
          .filter((value): value is string => Boolean(value))
          .sort((left, right) => new Date(left).getTime() - new Date(right).getTime())[0] ?? null;

        return {
          kind: entryKind,
          items,
          count: items.length,
          nextDueDate,
          activeCount: items.filter((item) => item.status === "active").length,
        };
      }),
    [commitments]
  );

  const selectedGroup = groupedCommitments.find((group) => group.kind === selectedKind) ?? groupedCommitments[0];
  const selectedItems = selectedGroup?.items ?? [];

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    detailPanelRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [selectedKind]);

  const totals = useMemo(() => {
    return groupedCommitments.reduce<Record<CommitmentKind, { count: number; nextDueDate: string | null; activeCount: number }>>(
      (acc, group) => {
        acc[group.kind] = {
          count: group.count,
          nextDueDate: group.nextDueDate,
          activeCount: group.activeCount,
        };
        return acc;
      },
      {
        planned_payment: { count: 0, nextDueDate: null, activeCount: 0 },
        debt: { count: 0, nextDueDate: null, activeCount: 0 },
        receivable: { count: 0, nextDueDate: null, activeCount: 0 },
        reminder: { count: 0, nextDueDate: null, activeCount: 0 },
      }
    );
  }, [groupedCommitments]);

  const recentTransactions = transactions.slice(0, 24);
  const suggestedRecurringPatterns = recurringPatterns.filter(
    (pattern) =>
      !commitments.some((commitment) => {
        const commitmentTitle = `${commitment.title} ${commitment.counterparty ?? ""}`.trim().toLowerCase();
        const patternName = (pattern.merchantClean ?? pattern.merchantRaw).trim().toLowerCase();
        return commitmentTitle.includes(patternName) || patternName.includes(commitment.title.trim().toLowerCase());
      })
  );
  const currencyCatalogCodes = useMemo(() => getCurrencyCatalogCodes(), []);
  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === accountId) ?? null,
    [accountId, accounts]
  );
  const suggestedKind = useMemo(
    () => getRecurringKindSuggestionForAccountType(selectedAccount?.type),
    [selectedAccount?.type]
  );
  const formCopy = commitmentFormCopy[kind];
  const hasSavedCommitments = commitments.length > 0;
  const openRecurringAdd = () => {
    window.dispatchEvent(new Event("clover:open-recurring-add"));
  };

  useEffect(() => {
    if (!suggestedKind) {
      return;
    }

    setKind((currentKind) => (currentKind === "planned_payment" ? suggestedKind : currentKind));
  }, [suggestedKind]);

  const recurringCounterpartyPlaceholder = selectedAccount
    ? isLiabilityAccountType(selectedAccount.type)
      ? "Lender, bank, merchant, billing partner"
      : selectedAccount.type === "receivable"
        ? "Client, friend, employer"
        : selectedAccount.type === "insurance"
          ? "Insurer, broker, provider"
          : selectedAccount.type === "prepaid"
            ? "Issuer, merchant, wallet provider"
            : "Landlord, lender, friend, merchant"
    : "Landlord, lender, friend, merchant";

  const resetForm = () => {
    setKind("planned_payment");
    setTitle("");
    setCounterparty("");
    setAmount("");
    setCurrency("PHP");
    setDueDate("");
    setRecurrence("once");
    setNotes("");
    setAccountId("");
    setTransactionId("");
    setPatternDraft({
      title: "",
      counterparty: "",
      amount: "",
      currency: "PHP",
      dueDate: "",
      recurrence: "monthly",
      accountId: "",
      notes: "",
      statementCheckpointId: "",
      installmentTerms: "",
    });
    setReviewingSuggestion(null);
  };

  const handleCreate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const shouldShowCounterparty = formCopy.showCounterparty;
    const shouldShowAmount = formCopy.showAmount;
    const shouldShowCurrency = formCopy.showCurrency;
    const shouldShowDueDate = formCopy.showDueDate;
    const shouldShowRecurrence = formCopy.showRecurrence;
    const shouldShowLinkedAccount = formCopy.showLinkedAccount;
    const shouldShowTransaction = formCopy.showTransaction;
    const shouldShowNotes = formCopy.showNotes;

    setIsSaving(true);
    void fetch("/api/commitments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspaceId,
        kind,
        title,
        counterparty: shouldShowCounterparty && counterparty.trim() ? counterparty : null,
        amount: shouldShowAmount && amount.trim() ? amount : null,
        currency: shouldShowCurrency ? currency.trim() || "PHP" : "PHP",
        dueDate: shouldShowDueDate && dueDate ? dueDate : null,
        recurrence: shouldShowRecurrence ? recurrence : "once",
        notes:
          shouldShowNotes && notes.trim()
            ? [notes.trim(), patternDraft.installmentTerms.trim() ? `Installment terms: ${patternDraft.installmentTerms.trim()}.` : null]
                .filter(Boolean)
                .join(" ")
            : patternDraft.installmentTerms.trim()
              ? `Installment terms: ${patternDraft.installmentTerms.trim()}.`
              : null,
        accountId: shouldShowLinkedAccount && accountId ? accountId : null,
        transactionId: shouldShowTransaction && transactionId ? transactionId : null,
        statementCheckpointId: patternDraft.statementCheckpointId || null,
        status: "active",
      }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? "Unable to save commitment");
        }

        resetForm();
        onCloseAdd?.();
        router.refresh();
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Unable to save commitment";
        window.alert(message);
      })
      .finally(() => {
        setIsSaving(false);
      });
  };

  const handleDelete = (commitmentId: string) => {
    if (!window.confirm("Delete this recurring item?")) {
      return;
    }

    setIsSaving(true);
    void fetch(`/api/commitments/${commitmentId}`, {
      method: "DELETE",
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? "Unable to delete commitment");
        }

        router.refresh();
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Unable to delete commitment";
        window.alert(message);
      })
      .finally(() => {
        setIsSaving(false);
      });
  };

  const openSuggestionReview = (suggestion: {
    id: string;
    sourceKind: "recurring_pattern" | PlannedPaymentSuggestion["sourceKind"];
    title: string;
    counterparty: string;
    amount: string;
    currency: string;
    dueDate: string;
    recurrence: (typeof commitmentRecurrenceOptions)[number]["value"];
    accountId: string;
    notes: string;
    sourceLabel: string;
    sourceDetail: string | null;
    statementCheckpointId: string | null;
    installmentTerms: string;
  }) => {
    setReviewingSuggestion(suggestion);
    setPatternDraft({
      title: suggestion.title,
      counterparty: suggestion.counterparty,
      amount: suggestion.amount,
      currency: suggestion.currency || "PHP",
      dueDate: suggestion.dueDate,
      recurrence: suggestion.recurrence,
      accountId: suggestion.accountId,
      notes: suggestion.notes,
      statementCheckpointId: suggestion.statementCheckpointId ?? "",
      installmentTerms: suggestion.installmentTerms ?? "",
    });
  };

  const openPatternReview = (pattern: RecurringPatternSummary) => {
    const title = pattern.merchantClean ?? pattern.merchantRaw;
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
      recurrence: recurrenceValue,
      accountId: pattern.account?.id ?? "",
      notes: `Detected from ${pattern.transactionCount} matching transaction${pattern.transactionCount === 1 ? "" : "s"}.`,
      sourceLabel: "Recurring pattern",
      sourceDetail: pattern.nextExpectedDate ? `Next due ${formatDate(pattern.nextExpectedDate)}` : null,
      reasonSummary: pattern.reasonSummary,
      statementCheckpointId: "",
      installmentTerms: "",
    });
  };

  const openPlannedPaymentReview = (suggestion: PlannedPaymentSuggestion) => {
    openSuggestionReview({
      id: suggestion.id,
      sourceKind: suggestion.sourceKind,
      title: suggestion.title,
      counterparty: suggestion.counterparty ?? suggestion.title,
      amount: suggestion.amount ?? "",
      currency: suggestion.currency,
      dueDate: toDateInputValue(suggestion.dueDate),
      recurrence: suggestion.recurrence,
      accountId: suggestion.accountId ?? "",
      notes: suggestion.notes ?? "",
      sourceLabel: suggestion.sourceLabel,
      sourceDetail: suggestion.sourceDetail,
      reasonSummary: suggestion.reasonSummary,
      statementCheckpointId: suggestion.statementCheckpointId,
      installmentTerms: suggestion.installmentTerms ?? "",
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
            kind: "planned_payment",
            title: patternDraft.title,
            counterparty: patternDraft.counterparty.trim() ? patternDraft.counterparty : null,
            amount: patternDraft.amount.trim() ? patternDraft.amount : null,
            currency: patternDraft.currency.trim() || "PHP",
            dueDate: patternDraft.dueDate || null,
            recurrence: patternDraft.recurrence,
            notes: notesToSave || null,
            accountId: patternDraft.accountId || null,
            transactionId: null,
            statementCheckpointId: patternDraft.statementCheckpointId || null,
            status: "active",
          }),
        });

    void request
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? "Unable to add recurring item");
        }

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
    void fetch(`/api/recurring-patterns/${patternId}/dismiss`, {
      method: "POST",
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? "Unable to hide recurring suggestion");
        }

        router.refresh();
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Unable to hide recurring suggestion";
        window.alert(message);
      })
      .finally(() => {
        setDismissingPatternId(null);
      });
  };

  return (
    <section style={{ display: "grid", gap: 24 }}>
      <div className="commitments-summary-grid">
        {groupedCommitments.map((group) => {
          const isSelected = selectedKind === group.kind;

          return (
            <button
              key={group.kind}
              type="button"
              onClick={() => setSelectedKind(group.kind)}
              className="panel"
              aria-pressed={isSelected}
              style={{
                appearance: "none",
                border: `1px solid ${isSelected ? kindRingTone[group.kind] : "rgba(148, 163, 184, 0.18)"}`,
                background: isSelected ? "rgba(255, 255, 255, 0.92)" : "rgba(255, 255, 255, 0.68)",
                display: "grid",
                gap: 10,
                padding: 18,
                textAlign: "left",
                boxShadow: isSelected ? "0 18px 36px rgba(15, 23, 42, 0.08)" : "none",
                transform: isSelected ? "translateY(-1px)" : "none",
                cursor: "pointer",
              }}
            >
              <p className="notification-item__tone" style={{ color: kindBadgeTone[group.kind] }}>
                {commitmentKindLabels[group.kind]}
              </p>
              <strong style={{ fontSize: 28, letterSpacing: "-0.03em" }}>{group.count}</strong>
              <div style={{ display: "grid", gap: 4, color: "var(--muted-foreground)" }}>
                <span>{group.nextDueDate ? `Next due ${formatDate(group.nextDueDate)}` : "No due date yet"}</span>
                <span>{group.activeCount} active</span>
              </div>
            </button>
          );
        })}
      </div>

      {plannedPaymentSuggestions.length > 0 ? (
        <article className="panel commitments-suggestions-panel">
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <p className="eyebrow">Planned payments</p>
              <h3 style={{ margin: 0 }}>Clover found potential recurring and upcoming payments</h3>
            </div>
            <span className="button button-secondary button-small">
              {plannedPaymentSuggestions.length} suggestion{plannedPaymentSuggestions.length === 1 ? "" : "s"}
            </span>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {plannedPaymentSuggestions.slice(0, 6).map((suggestion) => (
              <article key={suggestion.id} className="notification-item" style={{ alignItems: "flex-start" }}>
                <div className="notification-item__main" style={{ gap: 4 }}>
                  <p className="notification-item__tone">
                    {suggestion.sourceLabel}
                    {suggestion.confidence ? ` · ${suggestion.confidence}% confidence` : ""}
                  </p>
                  <h4>{suggestion.title}</h4>
                  <p>
                    {formatCurrency(suggestion.amount)}
                    {suggestion.accountName ? ` · ${suggestion.accountName}` : ""}
                    {suggestion.sourceDetail ? ` · ${suggestion.sourceDetail}` : ""}
                    {suggestion.sourceFileName ? ` · ${suggestion.sourceFileName}` : ""}
                  </p>
                  {suggestion.reasonSummary ? <p className="panel-muted">{suggestion.reasonSummary}</p> : null}
                  {suggestion.notes ? <p className="panel-muted">{suggestion.notes}</p> : null}
                </div>
                <div className="notification-item__time" style={{ minWidth: 170, display: "grid", gap: 8 }}>
                  <button
                    type="button"
                    className="button button-primary button-small"
                    onClick={() => openPlannedPaymentReview(suggestion)}
                    disabled={confirmingPatternId === suggestion.id}
                  >
                    {confirmingPatternId === suggestion.id ? "Adding..." : "Review and add"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </article>
      ) : null}

      {suggestedRecurringPatterns.length > 0 ? (
        <article className="panel commitments-suggestions-panel">
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <p className="eyebrow">Suggested recurring</p>
              <h3 style={{ margin: 0 }}>Clover found possible subscriptions and bills</h3>
            </div>
            <span className="button button-secondary button-small">{suggestedRecurringPatterns.length} suggestion{suggestedRecurringPatterns.length === 1 ? "" : "s"}</span>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {suggestedRecurringPatterns.slice(0, 6).map((pattern) => (
              <article key={pattern.id} className="notification-item" style={{ alignItems: "flex-start" }}>
                <div className="notification-item__main" style={{ gap: 4 }}>
                  <p className="notification-item__tone">
                    {pattern.frequency ? commitmentRecurrenceLabels[pattern.frequency as keyof typeof commitmentRecurrenceLabels] ?? pattern.frequency : "Recurring"} · {pattern.confidence}% confidence
                  </p>
                  <h4>{pattern.merchantClean ?? pattern.merchantRaw}</h4>
                  <p>
                    {formatCurrency(pattern.amount)}
                    {pattern.account ? ` · ${pattern.account.name}` : ""}
                    {pattern.transactionCount > 1 ? ` · seen ${pattern.transactionCount} times` : ""}
                    {pattern.nextExpectedDate ? ` · next ${formatDate(pattern.nextExpectedDate)}` : ""}
                  </p>
                  {pattern.reasonSummary ? <p className="panel-muted">{pattern.reasonSummary}</p> : null}
                </div>
                <div className="notification-item__time" style={{ minWidth: 170, display: "grid", gap: 8 }}>
                  <button
                    type="button"
                    className="button button-primary button-small"
                    onClick={() => openPatternReview(pattern)}
                    disabled={confirmingPatternId === pattern.id}
                  >
                    {confirmingPatternId === pattern.id ? "Adding..." : "Review and add"}
                  </button>
                  <button
                    type="button"
                    className="button button-secondary button-small"
                    onClick={() => handleDismissPattern(pattern.id)}
                    disabled={dismissingPatternId === pattern.id}
                  >
                    {dismissingPatternId === pattern.id ? "Hiding..." : "Not recurring"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </article>
      ) : null}

      {reviewingSuggestion ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 85,
            background: "rgba(15, 23, 42, 0.45)",
            backdropFilter: "blur(12px)",
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
        >
          <section className="panel glass" style={{ width: "min(720px, 100%)", display: "grid", gap: 16, maxHeight: "min(92vh, 880px)", overflow: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
              <div>
                <p className="eyebrow">Review suggestion</p>
                <h3 style={{ margin: 0 }}>
                  {reviewingSuggestion.sourceKind === "installment" ? "Add installment payment?" : "Add this to Recurring?"}
                </h3>
                <p className="panel-muted" style={{ margin: "6px 0 0" }}>
                  {reviewingSuggestion.sourceLabel}
                  {reviewingSuggestion.sourceDetail ? ` · ${reviewingSuggestion.sourceDetail}` : ""}
                </p>
                {reviewingSuggestion.reasonSummary ? (
                  <p className="panel-muted" style={{ margin: "6px 0 0" }}>
                    {reviewingSuggestion.reasonSummary}
                  </p>
                ) : null}
              </div>
              <button
                className="button button-secondary button-small recurring-modal-close"
                type="button"
                onClick={() => setReviewingSuggestion(null)}
                aria-label="Close"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 6l12 12" />
                  <path d="M18 6 6 18" />
                </svg>
              </button>
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
                  <span>Counterparty</span>
                  <input
                    className="settings-input"
                    value={patternDraft.counterparty}
                    onChange={(event) => setPatternDraft((draft) => ({ ...draft, counterparty: event.target.value }))}
                    placeholder="Merchant, biller, lender, or person"
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
                  <span className="sr-only">Currency</span>
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
                  <span>Next due date</span>
                  <input
                    className="settings-input"
                    type="date"
                    value={patternDraft.dueDate}
                    onChange={(event) => setPatternDraft((draft) => ({ ...draft, dueDate: event.target.value }))}
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
                        {account.name}
                        {account.institution ? ` · ${account.institution}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

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
                <button className="button button-secondary" type="button" onClick={() => setReviewingSuggestion(null)}>
                  Cancel
                </button>
                <button className="button button-primary" type="submit" disabled={confirmingPatternId === reviewingSuggestion.id}>
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

      {hasSavedCommitments ? (
        <article className="panel commitments-detail-panel" ref={detailPanelRef}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <p className="eyebrow">{commitmentKindLabels[selectedKind]}</p>
              <h3 style={{ margin: 0 }}>
                {selectedItems.length > 0 ? `${selectedItems.length} item${selectedItems.length === 1 ? "" : "s"}` : "Nothing saved yet"}
              </h3>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span className="button button-secondary button-small">{totals[selectedKind].activeCount} active</span>
              {totals[selectedKind].nextDueDate ? (
                <span className="button button-secondary button-small">Next {formatDate(totals[selectedKind].nextDueDate)}</span>
              ) : (
                <span className="button button-secondary button-small">No due date</span>
              )}
            </div>
          </div>

          {selectedItems.length > 0 ? (
            <div style={{ display: "grid", gap: 10 }}>
              {selectedItems.map((commitment) => (
                <article key={commitment.id} className="notification-item" style={{ alignItems: "flex-start" }}>
                  <div className="notification-item__main" style={{ gap: 4 }}>
                    <p className="notification-item__tone">
                      {commitmentStatusLabels[commitment.status]} · {commitment.recurrence ? commitmentRecurrenceLabels[commitment.recurrence] : "One-time"}
                    </p>
                    <h4>{commitment.title}</h4>
                    <p>
                      {formatCurrency(commitment.amount)}
                      {commitment.counterparty ? ` · ${commitment.counterparty}` : ""}
                      {commitment.dueDate ? ` · Due ${formatDate(commitment.dueDate)}` : ""}
                      {commitment.nextDueDate && commitment.nextDueDate !== commitment.dueDate ? ` · Next ${formatDate(commitment.nextDueDate)}` : ""}
                    </p>
                    {commitment.notes ? <p className="panel-muted">{commitment.notes}</p> : null}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {commitment.account ? (
                        <Link className="button button-secondary button-small" href={getAccountPath({ id: commitment.account.id, name: commitment.account.name })}>
                          Open account
                        </Link>
                      ) : null}
                      {commitment.transaction ? (
                        <span className="button button-secondary button-small" aria-label="Linked transaction">
                          {commitment.transaction.merchantClean ?? commitment.transaction.merchantRaw}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="notification-item__time" style={{ minWidth: 110 }}>
                    <time>{formatDate(getCommitmentDateValue(commitment))}</time>
                    <div style={{ marginTop: 8 }}>
                      <button
                        type="button"
                        className="button button-secondary button-small"
                        onClick={() => handleDelete(commitment.id)}
                        disabled={isSaving}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="panel-muted" style={{ margin: 0 }}>
              Saved {commitmentKindLabels[selectedKind].toLowerCase()}s will appear here once you add one.
            </p>
          )}
        </article>
      ) : (
        <article className="recurring-empty-cta">
          <img src="/clover-mark.svg" alt="" aria-hidden="true" />
          <p>
            <span>Add recurring transactions</span> to track what is due next, what repeats every month, and what needs follow-up.
          </p>
          <button className="button button-primary button-small recurring-topbar-add transactions-action-button" type="button" onClick={openRecurringAdd}>
            <span>Add Recurring</span>
          </button>
        </article>
      )}

      {showAddModal ? (
        <div
          className="recurring-add-modal"
          role="presentation"
          onClick={() => {
            onCloseAdd?.();
          }}
        >
          <section
            className="panel glass recurring-add-modal__card"
            style={{ width: "min(760px, 100%)", display: "grid", gap: 16, maxHeight: "min(92vh, 920px)", overflow: "auto", position: "relative" }}
            role="dialog"
            aria-modal="true"
            aria-label="Add recurring"
            onClick={(event) => event.stopPropagation()}
          >
            <button className="recurring-modal-close" type="button" onClick={onCloseAdd} aria-label="Close add recurring">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 6l12 12" />
                <path d="M18 6 6 18" />
              </svg>
            </button>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", paddingRight: 44 }}>
              <div>
                <p className="eyebrow">Add recurring</p>
              </div>
            </div>

            <form onSubmit={handleCreate} style={{ display: "grid", gap: 16 }}>
              <div
                style={{
                  display: "grid",
                  gap: 12,
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                }}
              >
                <label className="settings-field">
                  <span>Type</span>
                  <select value={kind} onChange={(event) => setKind(event.target.value as CommitmentKind)} className="settings-select">
                    {commitmentKindOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <p className="eyebrow">{formCopy.eyebrow}</p>
                <h4 style={{ margin: 0 }}>{formCopy.headline}</h4>
                <p className="panel-muted" style={{ margin: 0 }}>
                  {formCopy.helper}
                </p>
              </div>

              <label className="settings-field">
                <span>{formCopy.titleLabel}</span>
                <input
                  className="settings-input"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={formCopy.titlePlaceholder}
                  required
                />
              </label>

              {formCopy.showCounterparty || formCopy.showDueDate ? (
                <div className="recurring-add-modal__name-row">
                  {formCopy.showCounterparty ? (
                    <label className="settings-field">
                      <span>{formCopy.counterpartyLabel ?? "Counterparty"}</span>
                      <input
                        className="settings-input"
                        value={counterparty}
                        onChange={(event) => setCounterparty(event.target.value)}
                        placeholder={formCopy.counterpartyPlaceholder ?? recurringCounterpartyPlaceholder}
                      />
                    </label>
                  ) : null}

                  {formCopy.showDueDate ? (
                    <label className="settings-field">
                      <span>{formCopy.dueDateLabel ?? "Due date"}</span>
                      <input
                        className="settings-input"
                        type="date"
                        value={dueDate}
                        onChange={(event) => setDueDate(event.target.value)}
                        required={kind === "reminder"}
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}

              {formCopy.showCurrency || formCopy.showAmount ? (
                <div className="recurring-add-modal__money-row">
                  {formCopy.showCurrency ? (
                    <label className="settings-field">
                      <span className="sr-only">Currency</span>
                      <CurrencySelector
                        value={currency}
                        onChange={setCurrency}
                        options={currencyCatalogCodes}
                        ariaLabel="Select commitment currency"
                        className="settings-currency-field__selector recurring-currency-field__selector"
                        buttonClassName="settings-currency-field__button recurring-currency-field__button"
                        menuClassName="settings-currency-field__menu"
                        optionClassName="settings-currency-field__option"
                        menuAlignment="end"
                      />
                    </label>
                  ) : null}

                  {formCopy.showAmount ? (
                    <label className="settings-field">
                      <span>{formCopy.amountLabel ?? "Amount"}</span>
                      <input
                        className="settings-input"
                        inputMode="decimal"
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                        placeholder={formCopy.amountPlaceholder ?? "2500.00"}
                        required={kind === "debt" || kind === "receivable"}
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}

              {formCopy.showRecurrence ? (
                <div
                  style={{
                    display: "grid",
                    gap: 12,
                    gridTemplateColumns: formCopy.showLinkedAccount ? "repeat(auto-fit, minmax(220px, 1fr))" : "minmax(0, 1fr)",
                  }}
                >
                  <label className="settings-field">
                    <span>{formCopy.recurrenceLabel ?? "Repeat cadence"}</span>
                    <select
                      value={recurrence}
                      onChange={(event) => setRecurrence(event.target.value as typeof recurrence)}
                      className="settings-select"
                    >
                      {commitmentRecurrenceOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}

              {formCopy.showLinkedAccount ? (
                <label className="settings-field">
                  <span>{formCopy.linkedAccountLabel ?? "Linked account"}</span>
                  <select value={accountId} onChange={(event) => setAccountId(event.target.value)} className="settings-select">
                    <option value="">None</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                        {account.institution ? ` · ${account.institution}` : ""}
                      </option>
                    ))}
                  </select>
                  {formCopy.linkedAccountHelp ? <span className="panel-muted">{formCopy.linkedAccountHelp}</span> : null}
                </label>
              ) : null}

              {selectedAccount && suggestedKind && formCopy.showLinkedAccount ? (
                <p className="panel-muted" style={{ margin: 0 }}>
                  Because <strong>{selectedAccount.name}</strong> is a {formatAccountTypeLabel(selectedAccount.type).toLowerCase()}, Clover suggests the{" "}
                  <strong>{commitmentKindLabels[suggestedKind as CommitmentKind]}</strong> recurring type for this item.
                </p>
              ) : null}

              {formCopy.showTransaction ? (
                <label className="settings-field">
                  <span>{formCopy.transactionLabel ?? "Linked transaction"}</span>
                  <select value={transactionId} onChange={(event) => setTransactionId(event.target.value)} className="settings-select">
                    <option value="">None</option>
                    {recentTransactions.map((transaction) => (
                      <option key={transaction.id} value={transaction.id}>
                        {formatTransactionLabel(transaction)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {formCopy.showNotes ? (
                <label className="settings-field">
                  <span>{formCopy.notesLabel ?? "Notes"}</span>
                  <textarea
                    className="settings-textarea"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder={formCopy.notesPlaceholder ?? "Add context, reminders, or payoff details."}
                    rows={4}
                  />
                </label>
              ) : null}

              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <button className="button button-primary" type="submit" disabled={isSaving}>
                  {isSaving ? "Saving..." : kind === "reminder" ? "Save reminder" : "Save recurring"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  );
}
