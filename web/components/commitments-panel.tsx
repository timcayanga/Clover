"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  commitmentKindLabels,
  commitmentKindOptions,
  commitmentRecurrenceLabels,
  commitmentRecurrenceOptions,
  commitmentStatusLabels,
  type FinancialCommitmentSummary,
} from "@/lib/commitments";
import { getAccountPath } from "@/lib/account-path";
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
type CommitmentStatus = keyof typeof commitmentStatusLabels;

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

export function CommitmentsPanel({
  workspaceId,
  commitments,
  accounts,
  transactions,
  showAddModal = false,
  onCloseAdd,
}: CommitmentsPanelProps) {
  const router = useRouter();
  const detailPanelRef = useRef<HTMLDivElement | null>(null);
  const hasMountedRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
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
  const [commitmentStatus, setCommitmentStatus] = useState<CommitmentStatus>("active");
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
  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === accountId) ?? null,
    [accountId, accounts]
  );
  const suggestedKind = useMemo(
    () => getRecurringKindSuggestionForAccountType(selectedAccount?.type),
    [selectedAccount?.type]
  );

  useEffect(() => {
    if (!suggestedKind) {
      return;
    }

    setKind((currentKind) => (currentKind === "planned_payment" ? suggestedKind : currentKind));
  }, [suggestedKind]);

  const recurringTitlePlaceholder = selectedAccount
    ? isLiabilityAccountType(selectedAccount.type)
      ? "Monthly loan payment, mortgage due date, BNPL installment"
      : selectedAccount.type === "receivable"
        ? "Client reimbursement, friend loan repayment"
        : selectedAccount.type === "insurance"
          ? "Premium reminder, annual policy renewal"
          : selectedAccount.type === "prepaid"
            ? "Top-up reminder, prepaid expiry follow-up"
            : "Rent, Tuition, Friend loan, Credit card due date"
    : "Rent, Tuition, Friend loan, Credit card due date";

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
    setCommitmentStatus("active");
  };

  const handleCreate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

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
        counterparty: counterparty || null,
        amount: amount.trim() ? amount : null,
        currency: currency.trim() || "PHP",
        dueDate: dueDate || null,
        recurrence,
        notes: notes || null,
        accountId: accountId || null,
        transactionId: transactionId || null,
        status: commitmentStatus,
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

      {showAddModal ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 80,
            background: "rgba(15, 23, 42, 0.45)",
            backdropFilter: "blur(12px)",
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
        >
          <section className="panel glass" style={{ width: "min(760px, 100%)", display: "grid", gap: 16, maxHeight: "min(92vh, 920px)", overflow: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
              <div>
                <p className="eyebrow">Add recurring</p>
                <h3 style={{ margin: 0 }}>Save a payment, debt, receivable, or reminder</h3>
              </div>
              <button className="button button-secondary button-small" type="button" onClick={onCloseAdd}>
                Close
              </button>
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

                <label className="settings-field">
                  <span>Status</span>
                  <select
                    value={commitmentStatus}
                    onChange={(event) => setCommitmentStatus(event.target.value as CommitmentStatus)}
                    className="settings-select"
                  >
                    {Object.entries(commitmentStatusLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="settings-field">
                <span>Title</span>
                <input
                  className="settings-input"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={recurringTitlePlaceholder}
                  required
                />
              </label>

              <div
                style={{
                  display: "grid",
                  gap: 12,
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                }}
              >
                <label className="settings-field">
                  <span>Counterparty</span>
                  <input
                    className="settings-input"
                    value={counterparty}
                    onChange={(event) => setCounterparty(event.target.value)}
                    placeholder={recurringCounterpartyPlaceholder}
                  />
                </label>

                <label className="settings-field">
                  <span>Amount</span>
                  <input
                    className="settings-input"
                    inputMode="decimal"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="2500.00"
                  />
                </label>
              </div>

              <div
                style={{
                  display: "grid",
                  gap: 12,
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                }}
              >
                <label className="settings-field">
                  <span>Currency</span>
                  <input
                    className="settings-input"
                    value={currency}
                    onChange={(event) => setCurrency(event.target.value)}
                    placeholder="PHP"
                  />
                </label>

                <label className="settings-field">
                  <span>Due date</span>
                  <input
                    className="settings-input"
                    type="date"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                  />
                </label>
              </div>

              <div
                style={{
                  display: "grid",
                  gap: 12,
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                }}
              >
                <label className="settings-field">
                  <span>Recurrence</span>
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

                <label className="settings-field">
                  <span>Linked account</span>
                  <select value={accountId} onChange={(event) => setAccountId(event.target.value)} className="settings-select">
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

              {selectedAccount && suggestedKind ? (
                <p className="panel-muted" style={{ margin: 0 }}>
                  Because <strong>{selectedAccount.name}</strong> is a {formatAccountTypeLabel(selectedAccount.type).toLowerCase()}, Clover suggests the{" "}
                  <strong>{commitmentKindLabels[suggestedKind as CommitmentKind]}</strong> recurring type for this item.
                </p>
              ) : null}

              <label className="settings-field">
                <span>Linked transaction</span>
                <select value={transactionId} onChange={(event) => setTransactionId(event.target.value)} className="settings-select">
                  <option value="">None</option>
                  {recentTransactions.map((transaction) => (
                    <option key={transaction.id} value={transaction.id}>
                      {formatTransactionLabel(transaction)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="settings-field">
                <span>Notes</span>
                <textarea
                  className="settings-textarea"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Add context, due reminders, or payoff details."
                  rows={4}
                />
              </label>

              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <p className="panel-muted" style={{ margin: 0, maxWidth: 420 }}>
                  Clover will keep the item here until you mark it resolved or delete it. If something looks wrong, verify the source in Accounts
                  or Transactions first.
                </p>
                <button className="button button-primary" type="submit" disabled={isSaving}>
                  {isSaving ? "Saving..." : "Save recurring"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  );
}
