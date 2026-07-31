"use client";

import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CurrencySelector } from "@/components/currency-selector";
import {
  commitmentKindLabels,
  commitmentKindOptions,
  commitmentRecurrenceLabels,
  commitmentRecurrenceOptions,
  commitmentStatusLabels,
  commitmentStatusOptions,
  type FinancialCommitmentSummary,
} from "@/lib/commitments";
import type { RecurringPatternSummary } from "@/lib/recurring-page";
import type { PlannedPaymentSuggestion } from "@/lib/planned-payment-suggestions";
import { getCurrencyCatalogCodes } from "@/lib/currencies";
import { formatAccountTypeLabel, getRecurringKindSuggestionForAccountType, isLiabilityAccountType } from "@/lib/account-types";
import { capturePostHogClientEvent } from "@/components/posthog-analytics";
import { AccountBrandMark } from "@/components/account-brand-mark";
import { getAccountBrand } from "@/lib/account-brand";

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
type EditableCommitmentField = "title" | "counterparty" | "dueDate" | "recurrence" | "amount" | "accountId" | "status";

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
  const amountLabel = Number.isFinite(amount) ? currencyFormatter.format(amount) : transaction.amount;
  return `${merchant} · ${amountLabel} · ${dateFormatter.format(new Date(transaction.date))}`;
};

const getCommitmentDateValue = (commitment: FinancialCommitmentSummary) => commitment.nextDueDate ?? commitment.dueDate;

const mobileDateFormatter = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "2-digit",
  year: "numeric",
});

const getMobileDateGroup = (value: string | null) => {
  if (!value) {
    return { key: "undated", label: "No due date", timestamp: Number.POSITIVE_INFINITY };
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { key: value, label: value, timestamp: Number.POSITIVE_INFINITY - 1 };
  }

  return {
    key: parsed.toISOString().slice(0, 10),
    label: mobileDateFormatter.format(parsed),
    timestamp: parsed.getTime(),
  };
};

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
  const [dismissedPatternIds, setDismissedPatternIds] = useState<Set<string>>(() => new Set());
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
  const [editingCell, setEditingCell] = useState<{ commitmentId: string; field: EditableCommitmentField } | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [savingCommitmentId, setSavingCommitmentId] = useState<string | null>(null);
  const [mobileDetailId, setMobileDetailId] = useState<string | null>(null);
  const overviewStats = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 30);
    const activeCommitments = visibleCommitments.filter((item) => item.status === "active");
    const upcoming = activeCommitments
      .map((item) => ({ item, date: getCommitmentDateValue(item) }))
      .filter(({ date }) => {
        if (!date) {
          return false;
        }

        const timestamp = new Date(date).getTime();
        return Number.isFinite(timestamp) && timestamp >= start.getTime();
      })
      .sort((left, right) => new Date(left.date!).getTime() - new Date(right.date!).getTime());
    const dueWithin30Days = upcoming.filter(({ date }) => new Date(date!).getTime() <= end.getTime());
    const monthlyTotal = activeCommitments.reduce((total, item) => {
      const value = Number(item.amount);
      if (!Number.isFinite(value)) {
        return total;
      }

      const multiplier = {
        weekly: 52 / 12,
        biweekly: 26 / 12,
        monthly: 1,
        quarterly: 1 / 3,
        annual: 1 / 12,
        once: 0,
      }[item.recurrence] ?? 0;
      return total + value * multiplier;
    }, 0);

    return {
      upcoming,
      dueWithin30Days,
      dueWithin30DaysTotal: dueWithin30Days.reduce((total, { item }) => total + (Number(item.amount) || 0), 0),
      monthlyTotal,
      activeCount: activeCommitments.length,
    };
  }, [visibleCommitments]);

  useEffect(() => {
    setVisibleCommitments(commitments);
  }, [commitments]);

  useEffect(() => {
    const syncDetailFromLocation = () => {
      const detailId = new URLSearchParams(window.location.search).get("detail");
      setMobileDetailId(detailId);
    };

    syncDetailFromLocation();
    window.addEventListener("popstate", syncDetailFromLocation);
    return () => window.removeEventListener("popstate", syncDetailFromLocation);
  }, []);

  useEffect(() => {
    if (showAddModal) {
      setKind(initialKind);
    }
  }, [initialKind, showAddModal]);

  const recentTransactions = transactions.slice(0, 24);
  // Home counts recurring-transaction suggestions as potential payments, so
  // the Recurring overview must expose the same records for review.
  const actionablePlannedPaymentSuggestions = plannedPaymentSuggestions;
  const suggestedRecurringPatterns = useMemo(() => {
    const deduped = new Map<string, RecurringPatternSummary>();
    for (const pattern of recurringPatterns) {
      if (dismissedPatternIds.has(pattern.id)) {
        continue;
      }
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
  }, [dismissedPatternIds, recurringPatterns, visibleCommitments]);
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
  const addKindForActiveTab: CommitmentKind =
    activeTab === "debt" ? "debt" : activeTab === "owed" ? "receivable" : activeTab === "installments" ? "reminder" : activeTab === "planned" ? "planned_payment" : initialKind;
  const openRecurringAdd = () => {
    window.dispatchEvent(new CustomEvent("clover:open-recurring-add", { detail: { kind: addKindForActiveTab } }));
  };

  const openMobileDetail = (commitmentId: string) => {
    setMobileDetailId(commitmentId);
    const query = new URLSearchParams(window.location.search);
    query.set("detail", commitmentId);
    window.history.pushState({}, "", `${window.location.pathname}?${query.toString()}`);
  };

  const closeMobileDetail = () => {
    setMobileDetailId(null);
    const query = new URLSearchParams(window.location.search);
    query.delete("detail");
    const suffix = query.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${suffix ? `?${suffix}` : ""}`);
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

        setVisibleCommitments((current) => current.filter((commitment) => commitment.id !== commitmentId));
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

  const getEditableValue = (commitment: FinancialCommitmentSummary, field: EditableCommitmentField) => {
    switch (field) {
      case "title":
        return commitment.title;
      case "counterparty":
        return commitment.counterparty ?? "";
      case "dueDate":
        return toDateInputValue(getCommitmentDateValue(commitment));
      case "recurrence":
        return commitment.recurrence;
      case "amount":
        return commitment.amount ?? "";
      case "accountId":
        return commitment.accountId ?? "";
      case "status":
        return commitment.status;
    }
  };

  const beginCellEdit = (commitment: FinancialCommitmentSummary, field: EditableCommitmentField) => {
    if (savingCommitmentId) {
      return;
    }

    setEditingCell({ commitmentId: commitment.id, field });
    setEditingValue(getEditableValue(commitment, field));
  };

  const cancelCellEdit = () => {
    setEditingCell(null);
    setEditingValue("");
  };

  const saveCommitmentField = async (
    commitment: FinancialCommitmentSummary,
    field: EditableCommitmentField,
    nextValue: string
  ) => {
    const normalizedValue = nextValue.trim();
    if (field === "title" && !normalizedValue) {
      cancelCellEdit();
      return;
    }

    if (normalizedValue === getEditableValue(commitment, field)) {
      cancelCellEdit();
      return;
    }

    setSavingCommitmentId(commitment.id);
    try {
      const response = await fetch(`/api/commitments/${commitment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [field]: normalizedValue || null,
          ...(field === "dueDate" ? { nextDueDate: normalizedValue || null } : {}),
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
        current.map((item) => (item.id === commitment.id ? payload.commitment as FinancialCommitmentSummary : item))
      );
      cancelCellEdit();
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update recurring item";
      window.alert(message);
    } finally {
      setSavingCommitmentId(null);
    }
  };

  const handleEditorKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
    commitment: FinancialCommitmentSummary,
    field: EditableCommitmentField
  ) => {
    if (event.key === "Escape") {
      cancelCellEdit();
      return;
    }

    if (event.key === "Enter") {
      event.currentTarget.blur();
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
    void fetch(`/api/recurring-patterns/${patternId}/dismiss`, {
      method: "POST",
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

  const handleQuickAddPattern = (pattern: RecurringPatternSummary) => {
    setConfirmingPatternId(pattern.id);
    void fetch(`/api/recurring-patterns/${pattern.id}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as { commitment?: FinancialCommitmentSummary; error?: string } | null;
        if (!response.ok) {
          throw new Error(payload?.error ?? "Unable to add recurring item");
        }

        if (payload?.commitment) {
          setVisibleCommitments((current) => [payload.commitment as FinancialCommitmentSummary, ...current]);
        }
        setDismissedPatternIds((current) => new Set(current).add(pattern.id));
        capturePostHogClientEvent("recurring_item_confirmed", {
          workspace_id: workspaceId,
          source_kind: "recurring_pattern",
          recurrence: pattern.frequency ?? "monthly",
          has_amount: Boolean(pattern.amount),
        });
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
    const showsPerson = activeTab === "debt" || activeTab === "owed";
    const showsAccount = activeTab !== "owed";
    const personHeading = activeTab === "debt" ? "Owed To" : "Owed From";
    const columnCount = 6 + (showsPerson ? 1 : 0) + (showsAccount ? 1 : 0);
    const isEditing = (commitmentId: string, field: EditableCommitmentField) =>
      editingCell?.commitmentId === commitmentId && editingCell.field === field;

    const mobileGroups = Array.from(
      tabCommitments.reduce((groups, commitment) => {
        const group = getMobileDateGroup(getCommitmentDateValue(commitment));
        const current = groups.get(group.key) ?? { ...group, commitments: [] as FinancialCommitmentSummary[] };
        current.commitments.push(commitment);
        groups.set(group.key, current);
        return groups;
      }, new Map<string, ReturnType<typeof getMobileDateGroup> & { commitments: FinancialCommitmentSummary[] }>())
        .values()
    ).sort((left, right) => left.timestamp - right.timestamp);
    const mobileDetailCommitment = mobileDetailId
      ? tabCommitments.find((commitment) => commitment.id === mobileDetailId) ?? null
      : null;
    const renderStatusIcon = (status: FinancialCommitmentSummary["status"]) => {
      if (status === "resolved") {
        return <path d="m6.5 12.5 3.2 3.2 7.8-8" />;
      }
      if (status === "paused") {
        return <>
          <path d="M9 8v8" />
          <path d="M15 8v8" />
        </>;
      }
      return <>
        <circle cx="12" cy="12" r="7.5" />
        <path d="M12 8v4l2.5 1.5" />
      </>;
    };

    return (
      <article className="commitments-detail-panel">
        <div className="recurring-mobile-list" aria-label={`${tabLabel} list`}>
          {!hasRows ? (
            <div className="recurring-mobile-list__empty">
              <strong>{tabLabel === "money owed" ? "No money owed yet" : `No ${tabLabel}s yet`}</strong>
              <button className="button button-primary button-small" type="button" onClick={openRecurringAdd}>
                Add {tabLabel}
              </button>
            </div>
          ) : null}
          {mobileGroups.map((group) => (
            <section className="recurring-mobile-group" key={group.key}>
              <div className="recurring-mobile-group__date"><span>{group.label}</span></div>
              {group.commitments.map((commitment) => {
                const brand = getAccountBrand({
                  institution: commitment.account?.institution ?? null,
                  name: commitment.account?.name ?? "Recurring",
                  type: commitment.account?.type ?? null,
                });
                return (
                  <button
                    className="recurring-mobile-row"
                    type="button"
                    key={commitment.id}
                    onClick={() => openMobileDetail(commitment.id)}
                    aria-label={`Open ${commitment.title}`}
                  >
                    <span className="recurring-mobile-row__account" aria-hidden="true">
                      <AccountBrandMark accountBrand={brand} label={commitment.account?.name ?? commitment.title} />
                    </span>
                    <strong className="recurring-mobile-row__name">{commitment.title}</strong>
                    <span className="recurring-mobile-row__amount">{formatCurrency(commitment.amount)}</span>
                    <span
                      className={`recurring-mobile-row__status recurring-mobile-row__status--${commitment.status}`}
                      title={commitmentStatusLabels[commitment.status]}
                      aria-label={commitmentStatusLabels[commitment.status]}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        {renderStatusIcon(commitment.status)}
                      </svg>
                    </span>
                    <svg className="recurring-mobile-row__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m9 6 6 6-6 6" />
                    </svg>
                  </button>
                );
              })}
            </section>
          ))}
          {tabSuggestions.length > 0 ? (
            <section className="recurring-mobile-group">
              <div className="recurring-mobile-group__date"><span>Suggestions</span></div>
              {tabSuggestions.map((suggestion) => {
                const brand = getAccountBrand({ name: suggestion.accountName ?? suggestion.sourceLabel });
                return (
                  <button
                    className="recurring-mobile-row"
                    type="button"
                    key={suggestion.id}
                    onClick={() => openPlannedPaymentReview(suggestion)}
                    aria-label={`Review ${suggestion.title}`}
                  >
                    <span className="recurring-mobile-row__account" aria-hidden="true">
                      <AccountBrandMark accountBrand={brand} label={suggestion.accountName ?? suggestion.title} />
                    </span>
                    <strong className="recurring-mobile-row__name">{suggestion.title}</strong>
                    <span className="recurring-mobile-row__amount">{formatCurrency(suggestion.amount)}</span>
                    <span className="recurring-mobile-row__status recurring-mobile-row__status--review" title="Review" aria-label="Review">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 3v3" />
                        <path d="M12 18v3" />
                        <path d="m4.2 4.2 2.1 2.1" />
                        <path d="m17.7 17.7 2.1 2.1" />
                        <path d="M3 12h3" />
                        <path d="M18 12h3" />
                        <path d="m4.2 19.8 2.1-2.1" />
                        <path d="m17.7 6.3 2.1-2.1" />
                      </svg>
                    </span>
                    <svg className="recurring-mobile-row__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m9 6 6 6-6 6" />
                    </svg>
                  </button>
                );
              })}
            </section>
          ) : null}
        </div>
        <div className="table-wrap commitments-table-wrap">
          <table className="transactions-table commitments-table">
            <thead>
              <tr>
                <th>Description</th>
                {showsPerson ? <th>{personHeading}</th> : null}
                <th>Due Date</th>
                <th>Type</th>
                <th>Amount</th>
                {showsAccount ? <th>Account</th> : null}
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {!hasRows ? (
                <tr>
                  <td colSpan={columnCount} className="commitments-table__empty">
                    <strong>{tabLabel === "money owed" ? "No money owed yet" : `No ${tabLabel}s yet`}</strong>
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
                  {showsPerson ? <td>{suggestion.counterparty ?? "Add person"}</td> : null}
                  <td>{activeTab === "owed" && !suggestion.dueDate ? "" : formatDate(suggestion.dueDate)}</td>
                  <td>{suggestion.recurrence === "once" ? "One-time" : commitmentRecurrenceLabels[suggestion.recurrence]}</td>
                  <td>{formatCurrency(suggestion.amount)}</td>
                  {showsAccount ? <td>{suggestion.accountName ?? "Not linked"}</td> : null}
                  <td>
                    <button className="button button-primary button-small" type="button" onClick={() => openPlannedPaymentReview(suggestion)}>
                      Review and add
                    </button>
                  </td>
                  <td />
                </tr>
              ))}
              {tabCommitments.map((commitment) => (
                <tr key={commitment.id} className="commitments-table__row">
                  <td>
                    {isEditing(commitment.id, "title") ? (
                      <input
                        autoFocus
                        className="commitments-table__editor commitments-table__editor--text"
                        value={editingValue}
                        onChange={(event) => setEditingValue(event.target.value)}
                        onBlur={() => void saveCommitmentField(commitment, "title", editingValue)}
                        onKeyDown={(event) => handleEditorKeyDown(event, commitment, "title")}
                        aria-label="Edit description"
                      />
                    ) : (
                      <button
                        className="commitments-table__editable commitments-table__editable--primary"
                        type="button"
                        onClick={() => beginCellEdit(commitment, "title")}
                      >
                        {commitment.title}
                      </button>
                    )}
                    {!showsPerson && commitment.counterparty ? (
                      <span className="commitments-table__secondary">{commitment.counterparty}</span>
                    ) : null}
                  </td>
                  {showsPerson ? (
                    <td>
                      {isEditing(commitment.id, "counterparty") ? (
                        <input
                          autoFocus
                          className="commitments-table__editor commitments-table__editor--text"
                          value={editingValue}
                          onChange={(event) => setEditingValue(event.target.value)}
                          onBlur={() => void saveCommitmentField(commitment, "counterparty", editingValue)}
                          onKeyDown={(event) => handleEditorKeyDown(event, commitment, "counterparty")}
                          placeholder="Add person"
                          aria-label={`Edit ${personHeading.toLowerCase()}`}
                        />
                      ) : (
                        <button
                          className={`commitments-table__editable${commitment.counterparty ? "" : " is-placeholder"}`}
                          type="button"
                          onClick={() => beginCellEdit(commitment, "counterparty")}
                        >
                          {commitment.counterparty ?? "Add person"}
                        </button>
                      )}
                    </td>
                  ) : null}
                  <td>
                    {isEditing(commitment.id, "dueDate") ? (
                      <input
                        autoFocus
                        className="commitments-table__editor"
                        type="date"
                        value={editingValue}
                        onChange={(event) => setEditingValue(event.target.value)}
                        onBlur={() => void saveCommitmentField(commitment, "dueDate", editingValue)}
                        onKeyDown={(event) => handleEditorKeyDown(event, commitment, "dueDate")}
                        aria-label="Edit due date"
                      />
                    ) : (
                      <button
                        className={`commitments-table__editable${
                          activeTab === "owed" && !getCommitmentDateValue(commitment)
                            ? " commitments-table__editable--empty-date"
                            : ""
                        }`}
                        type="button"
                        onClick={() => beginCellEdit(commitment, "dueDate")}
                        aria-label={getCommitmentDateValue(commitment) ? "Edit due date" : "Add due date"}
                      >
                        {activeTab === "owed" && !getCommitmentDateValue(commitment)
                          ? "\u00A0"
                          : formatDate(getCommitmentDateValue(commitment))}
                      </button>
                    )}
                  </td>
                  <td>
                    {isEditing(commitment.id, "recurrence") ? (
                      <select
                        autoFocus
                        className="commitments-table__editor"
                        value={editingValue}
                        onChange={(event) => {
                          setEditingValue(event.target.value);
                          void saveCommitmentField(commitment, "recurrence", event.target.value);
                        }}
                        aria-label="Edit recurring type"
                      >
                        {commitmentRecurrenceOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    ) : (
                      <button className="commitments-table__editable" type="button" onClick={() => beginCellEdit(commitment, "recurrence")}>
                        {commitment.recurrence === "once" ? "One-time" : commitmentRecurrenceLabels[commitment.recurrence]}
                      </button>
                    )}
                  </td>
                  <td>
                    {isEditing(commitment.id, "amount") ? (
                      <input
                        autoFocus
                        className="commitments-table__editor commitments-table__editor--amount"
                        inputMode="decimal"
                        value={editingValue}
                        onChange={(event) => setEditingValue(event.target.value)}
                        onBlur={() => void saveCommitmentField(commitment, "amount", editingValue)}
                        onKeyDown={(event) => handleEditorKeyDown(event, commitment, "amount")}
                        aria-label="Edit amount"
                      />
                    ) : (
                      <button className="commitments-table__editable" type="button" onClick={() => beginCellEdit(commitment, "amount")}>
                        {formatCurrency(commitment.amount)}
                      </button>
                    )}
                  </td>
                  {showsAccount ? <td>
                    {isEditing(commitment.id, "accountId") ? (
                      <select
                        autoFocus
                        className="commitments-table__editor"
                        value={editingValue}
                        onChange={(event) => {
                          setEditingValue(event.target.value);
                          void saveCommitmentField(commitment, "accountId", event.target.value);
                        }}
                        aria-label="Edit linked account"
                      >
                        <option value="">Not linked</option>
                        {[...accounts]
                          .sort((left, right) => left.name.localeCompare(right.name))
                          .map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.name}{account.institution ? ` · ${account.institution}` : ""}
                            </option>
                          ))}
                      </select>
                    ) : (
                      <button className="commitments-table__editable" type="button" onClick={() => beginCellEdit(commitment, "accountId")}>
                        {commitment.account?.name ?? "Not linked"}
                      </button>
                    )}
                  </td> : null}
                  <td>
                    {isEditing(commitment.id, "status") ? (
                      <select
                        autoFocus
                        className="commitments-table__editor"
                        value={editingValue}
                        onChange={(event) => {
                          setEditingValue(event.target.value);
                          void saveCommitmentField(commitment, "status", event.target.value);
                        }}
                        aria-label="Edit status"
                      >
                        {commitmentStatusOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    ) : (
                      <button
                        className={`commitments-table__editable${
                          activeTab === "owed"
                            ? ` commitments-table__status commitments-table__status--${commitment.status}`
                            : ""
                        }`}
                        type="button"
                        onClick={() => beginCellEdit(commitment, "status")}
                      >
                        {commitmentStatusLabels[commitment.status]}
                      </button>
                    )}
                  </td>
                  <td className="commitments-table__actions">
                    <button
                      className="commitments-table__delete"
                      type="button"
                      onClick={() => handleDelete(commitment.id)}
                      disabled={isSaving || savingCommitmentId === commitment.id}
                      aria-label={`Delete ${commitment.title}`}
                      title="Delete"
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {mobileDetailCommitment ? (
          <section className="recurring-mobile-detail" aria-label={`${mobileDetailCommitment.title} details`}>
            <header className="recurring-mobile-detail__header">
              <button type="button" className="recurring-mobile-detail__back" onClick={closeMobileDetail} aria-label="Back to recurring list">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
              <div>
                <p className="eyebrow">Recurring details</p>
                <h2>{mobileDetailCommitment.title}</h2>
              </div>
            </header>
            <dl className="recurring-mobile-detail__fields">
              <div><dt>Status</dt><dd>{commitmentStatusLabels[mobileDetailCommitment.status]}</dd></div>
              <div><dt>Amount</dt><dd>{formatCurrency(mobileDetailCommitment.amount)}</dd></div>
              <div><dt>Due date</dt><dd>{formatDate(getCommitmentDateValue(mobileDetailCommitment))}</dd></div>
              <div><dt>Repeats</dt><dd>{mobileDetailCommitment.recurrence === "once" ? "One-time" : commitmentRecurrenceLabels[mobileDetailCommitment.recurrence]}</dd></div>
              {mobileDetailCommitment.account ? <div><dt>Account</dt><dd>{mobileDetailCommitment.account.name}</dd></div> : null}
              {mobileDetailCommitment.counterparty ? <div><dt>{activeTab === "owed" ? "Owed from" : "Payee"}</dt><dd>{mobileDetailCommitment.counterparty}</dd></div> : null}
              {mobileDetailCommitment.notes ? <div className="recurring-mobile-detail__field--wide"><dt>Notes</dt><dd>{mobileDetailCommitment.notes}</dd></div> : null}
            </dl>
          </section>
        ) : null}
      </article>
    );
  };

  return (
    <section style={{ display: "grid", gap: 24 }}>
      {activeTab !== "overview" ? renderRecurringTable() : null}

      {activeTab === "overview" ? <>
      <section className="recurring-overview-grid" aria-label="Recurring overview">
        <article className="panel recurring-overview-card">
          <div className="recurring-overview-card__heading">
            <p className="eyebrow">Next 30 days</p>
          </div>
          <strong className="recurring-overview-card__value">{formatCurrency(String(overviewStats.dueWithin30DaysTotal))}</strong>
          <p>{overviewStats.dueWithin30Days.length === 0 ? "No payments due yet" : `${overviewStats.dueWithin30Days.length} payment${overviewStats.dueWithin30Days.length === 1 ? "" : "s"} due`}</p>
        </article>

        <article className="panel recurring-overview-card recurring-overview-card--list">
          <div className="recurring-overview-card__heading">
            <p className="eyebrow">Upcoming payments</p>
          </div>
          {overviewStats.upcoming.length > 0 ? (
            <div className="recurring-overview-list">
              {overviewStats.upcoming.slice(0, 4).map(({ item }) => (
                <div key={item.id} className="recurring-overview-list__item">
                  <span>
                    <strong>{item.title}</strong>
                    <small>{formatDate(getCommitmentDateValue(item))}</small>
                  </span>
                  <strong>{formatCurrency(item.amount)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="recurring-overview-card__empty">Add recurring items to see what is coming up.</p>
          )}
        </article>

        <article className="panel recurring-overview-card">
          <div className="recurring-overview-card__heading">
            <p className="eyebrow">Monthly commitments</p>
          </div>
          <strong className="recurring-overview-card__value">{formatCurrency(String(overviewStats.monthlyTotal))}</strong>
          <p>Estimated from recurring active items</p>
        </article>

        <article className="panel recurring-overview-card recurring-overview-card--list">
          <div className="recurring-overview-card__heading">
            <p className="eyebrow">Needs attention</p>
          </div>
          {actionablePlannedPaymentSuggestions.length > 0 || suggestedRecurringPatterns.length > 0 ? (
            <div className="recurring-overview-list">
              {actionablePlannedPaymentSuggestions.slice(0, 2).map((suggestion) => (
                <div key={suggestion.id} className="recurring-overview-list__item">
                  <span>
                    <strong>{suggestion.title}</strong>
                    <small>{suggestion.sourceLabel}</small>
                  </span>
                  <button className="button button-secondary button-small recurring-overview-review-button" type="button" onClick={() => openPlannedPaymentReview(suggestion)}>
                    Review
                  </button>
                </div>
              ))}
              {actionablePlannedPaymentSuggestions.length < 2 ? suggestedRecurringPatterns.slice(0, 2).map((pattern) => (
                <div key={pattern.id} className="recurring-overview-list__item">
                  <span>
                    <strong>{pattern.merchantClean ?? pattern.merchantRaw}</strong>
                    <small>{formatDate(pattern.nextExpectedDate)}</small>
                  </span>
                  <button className="button button-secondary button-small recurring-overview-review-button" type="button" onClick={() => openPatternReview(pattern)}>
                    Review
                  </button>
                </div>
              )) : null}
            </div>
          ) : (
            <p className="recurring-overview-card__empty">Clover will show suggestions and missing details here.</p>
          )}
        </article>
      </section>

      {suggestedRecurringPatterns.length > 0 ? (
        <article className="panel commitments-suggestions-panel">
          <div>
            <p className="eyebrow">Potential recurring payments</p>
            <h3 style={{ margin: 0 }}>Clover found possible subscriptions and bills</h3>
          </div>
          <div className="recurring-suggestion-list">
            {suggestedRecurringPatterns.slice(0, 6).map((pattern) => (
              <article key={pattern.id} className="recurring-suggestion-row">
                <div className="recurring-suggestion-row__main">
                  <h4>{pattern.merchantClean ?? pattern.merchantRaw}</h4>
                  <p>{formatDate(pattern.nextExpectedDate)}</p>
                  {pattern.accountCount > 1 && pattern.distinctMonthCount > 1 ? (
                    <small>Seen across {pattern.accountCount} accounts and {pattern.distinctMonthCount} months</small>
                  ) : pattern.distinctMonthCount > 1 ? (
                    <small>Seen across {pattern.distinctMonthCount} months</small>
                  ) : null}
                </div>
                <div className="recurring-suggestion-row__actions">
                  <button
                    type="button"
                    className="button button-primary button-small"
                    onClick={() => handleQuickAddPattern(pattern)}
                    disabled={confirmingPatternId === pattern.id}
                  >
                    {confirmingPatternId === pattern.id ? "Adding..." : "Add"}
                  </button>
                  <button
                    type="button"
                    className="recurring-suggestion-row__dismiss"
                    onClick={() => handleDismissPattern(pattern.id)}
                    disabled={dismissingPatternId === pattern.id}
                    aria-label={`Delete ${pattern.merchantClean ?? pattern.merchantRaw} suggestion`}
                    title="Delete suggestion"
                  >
                    <span aria-hidden="true">×</span>
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
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 6l12 12" />
                <path d="M18 6 6 18" />
              </svg>
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
