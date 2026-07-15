"use client";

import Link from "next/link";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
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
  activeTab?: "overview" | "planned" | "debt" | "owed" | "installments";
  initialKind?: CommitmentKind;
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

type CommitmentKind = "planned_payment" | "debt" | "receivable" | "reminder";
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

const reasonBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 999,
  border: "1px solid rgba(3, 168, 192, 0.18)",
  padding: "4px 10px",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--accent)",
  background: "rgba(3, 168, 192, 0.08)",
};

const confidenceTierLabel: Record<"high" | "medium" | "low", string> = {
  high: "High confidence",
  medium: "Needs review",
  low: "Weak signal",
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

const getDaysUntilDate = (value: string | null) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return Math.ceil((parsed.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
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
    eyebrow: "Installment",
    headline: "Track an installment plan",
    helper: "Keep the next payment, amount, and cadence visible in one place.",
    titleLabel: "Installment",
    titlePlaceholder: "Phone plan, BNPL, salary loan",
    counterpartyLabel: "Provider or lender",
    counterpartyPlaceholder: "Bank, lender, merchant, or provider",
    amountLabel: "Installment amount",
    amountPlaceholder: "2500.00",
    dueDateLabel: "Next installment date",
    recurrenceLabel: "Payment cadence",
    linkedAccountLabel: "Linked account",
    linkedAccountHelp: "Optional if you want Clover to anchor the plan to an account.",
    notesLabel: "Notes",
    notesPlaceholder: "Add terms, remaining payments, or follow-up details.",
    showCounterparty: true,
    showAmount: true,
    showCurrency: true,
    showDueDate: true,
    showRecurrence: true,
    showLinkedAccount: true,
    showTransaction: false,
    showNotes: true,
  },
};

export function CommitmentsPanel({
  workspaceId,
  commitments,
  recurringPatterns,
  plannedPaymentSuggestions,
  accounts,
  transactions,
  activeTab = "overview",
  initialKind = "planned_payment",
  showAddModal = false,
  onCloseAdd,
}: CommitmentsPanelProps) {
  const router = useRouter();
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
    reasonTags: string[];
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
  const [kind, setKind] = useState<CommitmentKind>(initialKind);
  const [title, setTitle] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("PHP");
  const [dueDate, setDueDate] = useState("");
  const [recurrence, setRecurrence] = useState<(typeof commitmentRecurrenceOptions)[number]["value"]>("once");
  const [notes, setNotes] = useState("");
  const [accountId, setAccountId] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [manualMoreOpen, setManualMoreOpen] = useState(false);
  const [visibleCommitments, setVisibleCommitments] = useState(commitments);
  const selectedItems = visibleCommitments;
  const nextOverviewDueDate = useMemo(
    () =>
      visibleCommitments
        .map((item) => getCommitmentDateValue(item))
        .filter((value): value is string => Boolean(value))
        .sort((left, right) => new Date(left).getTime() - new Date(right).getTime())[0] ?? null,
    [visibleCommitments]
  );

  useEffect(() => {
    setVisibleCommitments(commitments);
  }, [commitments]);

  useEffect(() => {
    if (showAddModal) {
      setKind(initialKind);
    }
  }, [initialKind, showAddModal]);

  const recentTransactions = transactions.slice(0, 24);
  const suggestedRecurringPatterns = recurringPatterns.filter(
    (pattern) =>
      !visibleCommitments.some((commitment) => {
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
  const hasSavedCommitments = visibleCommitments.length > 0;
  const hasSuggestionContent = plannedPaymentSuggestions.length > 0 || suggestedRecurringPatterns.length > 0;
  const addKindForActiveTab: CommitmentKind =
    activeTab === "debt" ? "debt" : activeTab === "owed" ? "receivable" : activeTab === "installments" ? "reminder" : activeTab === "planned" ? "planned_payment" : initialKind;
  const openRecurringAdd = () => {
    window.dispatchEvent(new CustomEvent("clover:open-recurring-add", { detail: { kind: addKindForActiveTab } }));
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
    setManualMoreOpen(false);
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

        const now = new Date().toISOString();
        const optimisticCommitment: FinancialCommitmentSummary = {
          id: `optimistic-${Date.now()}`,
          workspaceId,
          kind,
          title: title.trim(),
          counterparty: formCopy.showCounterparty && counterparty.trim() ? counterparty.trim() : null,
          amount: formCopy.showAmount && amount.trim() ? amount.trim() : null,
          currency: formCopy.showCurrency ? currency.trim() || "PHP" : "PHP",
          dueDate: formCopy.showDueDate && dueDate ? new Date(`${dueDate}T00:00:00`).toISOString() : null,
          recurrence: formCopy.showRecurrence ? recurrence : "once",
          nextDueDate: formCopy.showDueDate && dueDate ? new Date(`${dueDate}T00:00:00`).toISOString() : null,
          notes: notes.trim() || null,
          accountId: formCopy.showLinkedAccount && accountId ? accountId : null,
          transactionId: formCopy.showTransaction && transactionId ? transactionId : null,
          statementCheckpointId: null,
          status: "active",
          source: "manual",
          confidence: 100,
          createdAt: now,
          updatedAt: now,
          account: selectedAccount,
          transaction: null,
        };
        setVisibleCommitments((current) => [optimisticCommitment, ...current]);
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
    reasonSummary: string | null;
    reasonTags: string[];
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
      reasonTags: pattern.reasonTags,
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
      reasonTags: suggestion.reasonTags,
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
            kind: reviewingSuggestion.sourceKind === "installment" ? "reminder" : "planned_payment",
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
        const payload = (await response.json().catch(() => null)) as { commitment?: FinancialCommitmentSummary; error?: string } | null;
        if (!response.ok) {
          throw new Error(payload?.error ?? "Unable to add recurring item");
        }

        if (payload?.commitment) {
          setVisibleCommitments((current) => [payload.commitment as FinancialCommitmentSummary, ...current.filter((item) => item.id !== payload.commitment?.id)]);
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

  const tabCommitments = useMemo(() => {
    switch (activeTab) {
      case "planned":
        return visibleCommitments.filter((commitment) => commitment.kind === "planned_payment");
      case "debt":
        return visibleCommitments.filter((commitment) => commitment.kind === "debt");
      case "owed":
        return visibleCommitments.filter((commitment) => commitment.kind === "receivable");
      case "installments":
        return visibleCommitments.filter(
          (commitment) =>
            commitment.kind === "reminder" ||
            commitment.notes?.toLowerCase().includes("installment") ||
            Boolean(commitment.notes?.toLowerCase().match(/payment\s+\d+\s+of\s+\d+/))
        );
      default:
        return [];
    }
  }, [activeTab, visibleCommitments]);

  const tabSuggestions = useMemo(() => {
    switch (activeTab) {
      case "planned":
        return plannedPaymentSuggestions.filter((suggestion) => suggestion.sourceKind !== "installment");
      case "debt":
        return plannedPaymentSuggestions.filter((suggestion) =>
          suggestion.reasonTags.some((tag) => ["loan", "statement payment", "installment terms"].includes(tag))
        );
      case "installments":
        return plannedPaymentSuggestions.filter((suggestion) => suggestion.sourceKind === "installment");
      default:
        return [];
    }
  }, [activeTab, plannedPaymentSuggestions]);

  const renderRecurringTable = () => {
    const tabLabel = activeTab === "planned" ? "planned payment" : activeTab === "debt" ? "debt or loan" : activeTab === "owed" ? "money owed" : "installment";
    const hasRows = tabCommitments.length > 0 || tabSuggestions.length > 0;

    return (
      <article className="panel commitments-detail-panel">
        <div className="table-wrap transactions-table-wrap commitments-table-wrap">
          <table className="transactions-table commitments-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Due Date</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Account</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {!hasRows ? (
                <tr>
                  <td colSpan={6} className="commitments-table__empty">
                    <strong>No {tabLabel}s yet</strong>
                    <span>Add one to start tracking it here.</span>
                    <button className="button button-primary button-small" type="button" onClick={openRecurringAdd}>
                      Add {tabLabel}
                    </button>
                  </td>
                </tr>
              ) : null}
              {tabSuggestions.map((suggestion) => (
                <tr key={suggestion.id}>
                  <td>
                    <strong>{suggestion.title}</strong>
                    <span className="commitments-table__secondary">{suggestion.sourceLabel}</span>
                  </td>
                  <td>{formatDate(suggestion.dueDate)}</td>
                  <td>{suggestion.recurrence === "once" ? "One-time" : commitmentRecurrenceLabels[suggestion.recurrence]}</td>
                  <td>{formatCurrency(suggestion.amount)}</td>
                  <td>{suggestion.accountName ?? "Not linked"}</td>
                  <td>
                    <button className="button button-primary button-small" type="button" onClick={() => openPlannedPaymentReview(suggestion)}>
                      Review and add
                    </button>
                  </td>
                </tr>
              ))}
              {tabCommitments.map((commitment) => (
                <tr key={commitment.id}>
                  <td>
                    <strong>{commitment.title}</strong>
                    <span className="commitments-table__secondary">{commitment.counterparty ?? commitmentStatusLabels[commitment.status]}</span>
                  </td>
                  <td>{formatDate(getCommitmentDateValue(commitment))}</td>
                  <td>{commitment.recurrence === "once" ? "One-time" : commitmentRecurrenceLabels[commitment.recurrence]}</td>
                  <td>{formatCurrency(commitment.amount)}</td>
                  <td>{commitment.account?.name ?? "Not linked"}</td>
                  <td>
                    <button className="button button-secondary button-small" type="button" onClick={() => handleDelete(commitment.id)} disabled={isSaving}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    );
  };

  return (
    <section style={{ display: "grid", gap: 24 }}>
      {activeTab !== "overview" ? renderRecurringTable() : null}

      {activeTab === "overview" ? <>

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
                    {suggestion.confidence ? ` · ${confidenceTierLabel[suggestion.confidenceTier]} · ${suggestion.confidence}% confidence` : ""}
                  </p>
                  <h4>{suggestion.title}</h4>
                  <p>
                    {formatCurrency(suggestion.amount)}
                    {suggestion.accountName ? ` · ${suggestion.accountName}` : ""}
                    {suggestion.sourceDetail ? ` · ${suggestion.sourceDetail}` : ""}
                    {suggestion.sourceFileName ? ` · ${suggestion.sourceFileName}` : ""}
                  </p>
                  {(() => {
                    const daysUntil = getDaysUntilDate(suggestion.dueDate);
                    if (daysUntil === null || daysUntil < 0 || daysUntil > 7) {
                      return null;
                    }

                    return (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ ...reasonBadgeStyle, color: "var(--warn)", borderColor: "rgba(245, 158, 11, 0.18)", background: "rgba(245, 158, 11, 0.10)" }}>
                          {daysUntil === 0 ? "Due today" : daysUntil === 1 ? "Due tomorrow" : `Due in ${daysUntil} days`}
                        </span>
                      </div>
                    );
                  })()}
                  {suggestion.reasonTags.length > 0 ? (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {suggestion.reasonTags.map((tag) => (
                        <span key={tag} style={reasonBadgeStyle}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {suggestion.reasonSummary ? (
                    <p className="panel-muted">
                      <strong style={{ color: "var(--foreground)" }}>Why Clover suggested this:</strong> {suggestion.reasonSummary}
                    </p>
                  ) : null}
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
                    {pattern.frequency ? commitmentRecurrenceLabels[pattern.frequency as keyof typeof commitmentRecurrenceLabels] ?? pattern.frequency : "Recurring"} · {confidenceTierLabel[pattern.confidenceTier]} · {pattern.confidence}% confidence
                  </p>
                  <h4>{pattern.merchantClean ?? pattern.merchantRaw}</h4>
                  <p>
                    {formatCurrency(pattern.amount)}
                    {pattern.account ? ` · ${pattern.account.name}` : ""}
                    {pattern.transactionCount > 1 ? ` · seen ${pattern.transactionCount} times` : ""}
                    {pattern.nextExpectedDate ? ` · next ${formatDate(pattern.nextExpectedDate)}` : ""}
                  </p>
                  {pattern.reasonTags.length > 0 ? (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {pattern.reasonTags.map((tag) => (
                        <span key={tag} style={reasonBadgeStyle}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {pattern.reasonSummary ? (
                    <p className="panel-muted">
                      <strong style={{ color: "var(--foreground)" }}>Why Clover suggested this:</strong> {pattern.reasonSummary}
                    </p>
                  ) : null}
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

      </> : null}

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
                    <strong style={{ color: "var(--foreground)" }}>Why Clover suggested this:</strong> {reviewingSuggestion.reasonSummary}
                  </p>
                ) : null}
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

      {activeTab === "overview" ? <>
      {hasSavedCommitments || hasSuggestionContent ? (
        <article className="panel commitments-detail-panel">
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <p className="eyebrow">Overview</p>
              <h3 style={{ margin: 0 }}>
                {selectedItems.length > 0
                  ? `${selectedItems.length} item${selectedItems.length === 1 ? "" : "s"}`
                  : hasSuggestionContent
                    ? "Suggestions ready"
                    : "Nothing saved yet"}
              </h3>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span className="button button-secondary button-small">{commitments.filter((item) => item.status === "active").length} active</span>
              {nextOverviewDueDate ? (
                <span className="button button-secondary button-small">Next {formatDate(nextOverviewDueDate)}</span>
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
              {hasSuggestionContent
                ? "Suggested recurring transactions are ready above. Review and add them to start tracking them here."
                : "Saved recurring items will appear here once you add one."}
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

      </> : null}

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
                <h3 style={{ margin: "4px 0 0" }}>Keep track of something that repeats</h3>
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

              {(formCopy.showLinkedAccount || formCopy.showTransaction || formCopy.showNotes || Boolean(formCopy.linkedAccountHelp)) ? (
                <div style={{ display: "grid", gap: 10 }}>
                  <button
                    type="button"
                    className="button button-secondary button-small"
                    onClick={() => setManualMoreOpen((current) => !current)}
                    aria-expanded={manualMoreOpen}
                    style={{ justifySelf: "start" }}
                  >
                    <span>{manualMoreOpen ? "Less" : "More"}</span>
                    <span aria-hidden="true" style={{ display: "inline-flex", transform: manualMoreOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 160ms ease" }}>
                      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                        <path d="m5 8 5 5 5-5" />
                      </svg>
                    </span>
                  </button>

                  {manualMoreOpen ? (
                    <div style={{ display: "grid", gap: 16 }}>
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
                    </div>
                  ) : null}
                </div>
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
