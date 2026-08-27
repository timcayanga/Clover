"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { CloverShell } from "@/components/clover-shell";
import { CategoryBrandMark } from "@/components/category-brand-mark";
import { TransactionAccountPicker, type TransactionPickerAccount } from "@/components/transaction-account-picker";
import { TransactionCategoryPicker } from "@/components/transaction-category-picker";
import { CurrencySelector } from "@/components/currency-selector";
import { SplitBillTransactionLinkFields } from "@/components/split-bill-transaction-link-fields";
import { TransactionCrossFeatureActions } from "@/components/transaction-cross-feature-actions";
import { getAccountBrand } from "@/lib/account-brand";
import type { AccountType } from "@/lib/domain-types";
import { buildTransactionDetailDraft, type TransactionDetailDraftValue } from "@/lib/transaction-detail-draft";
import { buildTransactionUpdatePayload } from "@/lib/transaction-update-payload";
import { getCurrencyCatalogCodes } from "@/lib/currencies";
import { formatCurrencyAmount } from "@/lib/currency-format";
import {
  createEmptyReceiptLineItem,
  getManualReceiptLineItemTotal,
  getReceiptLineItemComputedAmount,
} from "@/lib/receipt-line-items";
import { createSplitBillFromTransaction, type SplitBillTransactionLinkDraft } from "@/lib/split-bill-transaction-link";

type Transaction = {
  id: string;
  workspaceId: string;
  accountId: string;
  accountName: string;
  institution?: string | null;
  accountNumber?: string | null;
  categoryId: string | null;
  categoryName: string | null;
  date: string;
  amount: string;
  currency: string;
  type: "income" | "expense" | "transfer";
  merchantRaw: string;
  merchantClean: string | null;
  description?: string | null;
  isTransfer: boolean;
  isExcluded: boolean;
  source?: string | null;
  importFileId?: string | null;
  rawPayload?: unknown;
  normalizedPayload?: unknown;
  reviewStatus?: string | null;
  parserConfidence?: number | null;
  categoryConfidence?: number | null;
  accountMatchConfidence?: number | null;
  duplicateConfidence?: number | null;
  transferConfidence?: number | null;
  splitBill?: { id: string; title: string } | null;
};

type AccountOption = {
  id: string;
  name: string;
  institution: string | null;
  accountNumber: string | null;
  type: AccountType;
  currency: string;
};

type CategoryOption = {
  id: string;
  name: string;
  type: "income" | "expense" | "transfer";
};

type DetailPayload = {
  transaction?: Transaction;
  accounts?: AccountOption[];
  categories?: CategoryOption[];
  error?: string;
};

const displayAccountName = (account: AccountOption) => {
  const base = account.institution?.trim() || account.name.trim() || "Account";
  const digits = account.accountNumber?.replace(/\D/g, "") ?? "";
  return digits.length >= 4 ? `${base} ${digits.slice(-4)}` : base;
};

const getConfidenceScore = (transaction: Transaction) => {
  const values = [
    transaction.parserConfidence,
    transaction.categoryConfidence,
    transaction.accountMatchConfidence,
    transaction.duplicateConfidence,
    transaction.transferConfidence,
  ].filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (values.length === 0) return transaction.source === "manual" ? 100 : 80;
  return Math.round(values.reduce((sum, value) => {
    const score = value <= 1 ? value * 100 : value;
    return sum + Math.max(0, Math.min(100, score));
  }, 0) / values.length);
};

export default function TransactionDetailPage() {
  const params = useParams<{ transactionId: string }>();
  const router = useRouter();
  const transactionId = typeof params?.transactionId === "string" ? params.transactionId : "";
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [draft, setDraft] = useState<TransactionDetailDraftValue | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [splitBillOpen, setSplitBillOpen] = useState(false);
  const [splitBillSaving, setSplitBillSaving] = useState(false);
  const [splitBillDraft, setSplitBillDraft] = useState<SplitBillTransactionLinkDraft>({ groupId: "", participantNames: [] });

  const goBack = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/transactions");
  };

  useEffect(() => {
    document.title = "Clover | Transaction Details";
  }, []);

  useEffect(() => {
    if (!transactionId) {
      setStatus("missing");
      return;
    }

    const controller = new AbortController();
    setStatus("loading");
    fetch(`/api/transactions/${encodeURIComponent(transactionId)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as DetailPayload;
        if (response.status === 404) {
          setStatus("missing");
          return;
        }
        if (!response.ok || !payload.transaction) {
          throw new Error(payload.error || "Unable to load transaction.");
        }

        const nextTransaction = payload.transaction;
        setTransaction(nextTransaction);
        setAccounts(payload.accounts ?? []);
        setCategories(payload.categories ?? []);
        setDraft(
          buildTransactionDetailDraft(nextTransaction, {
            merchantClean: nextTransaction.merchantClean ?? nextTransaction.merchantRaw,
            effectiveType: nextTransaction.type,
            categoryId: nextTransaction.categoryId,
            isTransfer: nextTransaction.type === "transfer" || nextTransaction.isTransfer,
          })
        );
        setStatus("ready");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setMessage(error instanceof Error ? error.message : "Unable to load transaction.");
        setStatus("error");
      });

    return () => controller.abort();
  }, [transactionId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        goBack();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === draft?.categoryId) ?? null,
    [categories, draft?.categoryId]
  );
  const accountPickerOptions = useMemo<TransactionPickerAccount[]>(
    () =>
      accounts
        .filter((account) => account.type !== "investment")
        .map((account) => ({
          id: account.id,
          label: displayAccountName(account),
          subtitle: account.institution ?? account.type.replaceAll("_", " "),
          brand: getAccountBrand(account),
        })),
    [accounts]
  );
  const confidenceScore = transaction ? getConfidenceScore(transaction) : 0;
  const confidenceLabel = confidenceScore >= 85 ? "High confidence" : confidenceScore >= 65 ? "Medium confidence" : "Low confidence";
  const receiptLineTotal = useMemo(() => getManualReceiptLineItemTotal(draft?.receiptLineItems ?? []), [draft?.receiptLineItems]);

  const updateLineItem = (index: number, field: "description" | "quantity" | "currency" | "amount", value: string) => {
    setDraft((current) => current ? {
      ...current,
      receiptLineItems: current.receiptLineItems.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item),
    } : current);
  };

  const createSplitBill = async () => {
    if (!transaction || !draft || splitBillSaving) return;
    setSplitBillSaving(true);
    setMessage("");
    try {
      const bill = await createSplitBillFromTransaction({
        workspaceId: transaction.workspaceId,
        transactionId: transaction.id,
        transactionTitle: draft.merchantClean || transaction.merchantRaw,
        billDate: draft.date,
        currency: draft.currency,
        amount: draft.amount,
        draft: splitBillDraft,
        receiptLineItems: draft.receiptLineItems.map((item) => ({ description: item.description, amount: String(getReceiptLineItemComputedAmount(item) ?? 0) })),
      }) as { id?: string; title?: string };
      setTransaction({ ...transaction, splitBill: bill.id ? { id: bill.id, title: bill.title || draft.merchantClean } : transaction.splitBill });
      setSplitBillOpen(false);
      setMessage("Added to Split Bills.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to add this transaction to Split Bills.");
    } finally {
      setSplitBillSaving(false);
    }
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!transaction || !draft || saving) {
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/transactions/${encodeURIComponent(transaction.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildTransactionUpdatePayload(draft, transaction)),
      });
      const payload = (await response.json().catch(() => ({}))) as DetailPayload;
      if (!response.ok || !payload.transaction) {
        throw new Error(payload.error || "Unable to save transaction.");
      }

      const updated = payload.transaction;
      setTransaction(updated);
      setDraft(
        buildTransactionDetailDraft(updated, {
          merchantClean: updated.merchantClean ?? updated.merchantRaw,
          effectiveType: updated.type,
          categoryId: updated.categoryId,
          isTransfer: updated.type === "transfer" || updated.isTransfer,
        })
      );
      setMessage("Transaction saved.");
      setEditing(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save transaction.");
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    if (!transaction) return;
    setDraft(
      buildTransactionDetailDraft(transaction, {
        merchantClean: transaction.merchantClean ?? transaction.merchantRaw,
        effectiveType: transaction.type,
        categoryId: transaction.categoryId,
        isTransfer: transaction.type === "transfer" || transaction.isTransfer,
      })
    );
    setEditing(false);
    setMessage("");
  };

  const deleteTransaction = async () => {
    if (!transaction || saving) {
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/transactions/${encodeURIComponent(transaction.id)}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error("Unable to delete transaction.");
      }
      router.replace("/transactions");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete transaction.");
      setSaving(false);
      setConfirmingDelete(false);
    }
  };

  return (
    <CloverShell active="transactions" title="Transaction Details" showTopbar={false}>
      <main className="transaction-detail-page">
        <header className="transaction-detail-page__header">
          <button className="transaction-detail-page__back" type="button" onClick={goBack} aria-label="Back to transactions">
            <span aria-hidden="true">‹</span>
            <span className="transaction-detail-page__back-label">Transactions</span>
          </button>
          <div className="transaction-detail-page__header-title">
            <p className="eyebrow">Transaction Details</p>
            <h1>{editing ? "Edit transaction" : "Transaction details"}</h1>
          </div>
          {transaction ? (
            <div className="transaction-detail-page__header-actions">
              {editing ? (
                <button className="button button-ghost button-small" type="button" onClick={cancelEdit} disabled={saving}>Cancel</button>
              ) : (
                <>
                  <button className="button button-secondary button-small" type="button" onClick={() => setEditing(true)}>Edit</button>
                  <div className="transaction-detail-page__action-menu">
                    <button className="icon-button" type="button" aria-label="More transaction actions" aria-expanded={actionMenuOpen} onClick={() => setActionMenuOpen((current) => !current)}>•••</button>
                    {actionMenuOpen ? (
                      <div className="transaction-detail-page__action-menu-popover" role="menu">
                        <button type="button" role="menuitem" onClick={() => { setActionMenuOpen(false); setConfirmingDelete(true); }}>Delete transaction</button>
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          ) : null}
        </header>

        {status === "loading" ? (
          <section className="transaction-detail-page__state" role="status">
            <span className="transaction-detail-page__spinner" aria-hidden="true" />
            <p>Loading transaction...</p>
          </section>
        ) : status === "missing" ? (
          <section className="transaction-detail-page__state">
            <h2>Transaction not found</h2>
            <p>It may have been deleted or is no longer available.</p>
            <button className="button button-primary button-small" type="button" onClick={() => router.push("/transactions")}>
              Back to Transactions
            </button>
          </section>
        ) : status === "error" ? (
          <section className="transaction-detail-page__state">
            <h2>Something went wrong</h2>
            <p>{message || "Please try opening this transaction again."}</p>
            <button className="button button-primary button-small" type="button" onClick={() => window.location.reload()}>
              Try Again
            </button>
          </section>
        ) : transaction && draft ? (
          <form className="transaction-detail-page__form" onSubmit={save}>
            <section className="transaction-detail-page__summary">
              <CategoryBrandMark categoryName={selectedCategory?.name ?? transaction.categoryName ?? "Other"} size={38} radius={12} />
              <div>
                <strong>{draft.merchantClean || transaction.merchantRaw}</strong>
                <span>{new Date(`${draft.date}T00:00:00`).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })}</span>
              </div>
              <strong className={`transaction-detail-page__amount is-${draft.type}`}>
                {formatCurrencyAmount(Number(draft.amount || 0), draft.currency)}
              </strong>
            </section>

            {editing ? (
            <section className="transaction-detail-page__fields">
              <div className="transaction-detail-page__type-section">
                <span>Transaction type</span>
                <div className="transactions-manual-type-toggle" role="group" aria-label="Transaction type">
                  {([
                    { value: "debit", label: "Expense", icon: "−" },
                    { value: "credit", label: "Income", icon: "+" },
                    { value: "transfer", label: "Transfer", icon: "↔" },
                  ] as const).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`transactions-manual-type-toggle__button ${draft.type === option.value ? "is-active" : ""}`}
                      aria-pressed={draft.type === option.value}
                      onClick={() => setDraft({ ...draft, type: option.value, isTransfer: option.value === "transfer" })}
                    >
                      <span aria-hidden="true">{option.icon}</span>
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <label>
                Name
                <input value={draft.merchantClean} onChange={(event) => setDraft({ ...draft, merchantClean: event.target.value })} />
              </label>
              <label>
                Date
                <input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} />
              </label>
              <label>
                Account
                <TransactionAccountPicker
                  accounts={accountPickerOptions}
                  selectedId={draft.accountId}
                  onSelect={(account) => setDraft({ ...draft, accountId: account.id })}
                  ariaLabel="Choose transaction account"
                  className="transaction-detail-page__relation-picker"
                />
              </label>
              <label>
                Category
                <TransactionCategoryPicker
                  categories={categories}
                  selectedId={draft.categoryId}
                  onSelect={(category) => setDraft({ ...draft, categoryId: category.id })}
                  ariaLabel="Choose transaction category"
                  className="transaction-detail-page__relation-picker"
                />
              </label>
              <label>
                Amount
                <span className="transaction-detail-page__money-control">
                  <CurrencySelector
                    value={draft.currency}
                    onChange={(currency) => setDraft({ ...draft, currency })}
                    options={getCurrencyCatalogCodes()}
                    ariaLabel="Select transaction currency"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={draft.amount}
                    onChange={(event) => setDraft({ ...draft, amount: event.target.value })}
                  />
                </span>
              </label>
            </section>
            ) : (
              <section className="transaction-detail-page__facts">
                <div><span>Type</span><strong>{draft.type === "credit" ? "Income" : draft.type === "transfer" ? "Transfer" : "Expense"}</strong></div>
                <div><span>Account</span><strong>{displayAccountName(accounts.find((account) => account.id === draft.accountId) ?? { id: "", name: transaction.accountName, institution: transaction.institution ?? null, accountNumber: transaction.accountNumber ?? null, type: "bank", currency: draft.currency })}</strong></div>
                <div><span>Category</span><strong>{selectedCategory?.name ?? transaction.categoryName ?? "Other"}</strong></div>
                <div><span>Date</span><strong>{new Date(`${draft.date}T00:00:00`).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })}</strong></div>
                <div className="transaction-detail-page__facts-notes"><span>Notes</span><strong>{draft.description.trim() || "No notes"}</strong></div>
              </section>
            )}

            {editing ? (
            <details className="transaction-detail-page__more">
              <summary>More</summary>
              <div className="transaction-detail-page__more-body">
                <label className="transaction-detail-page__notes">
                  Notes
                  <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Optional note" />
                </label>
                <div className="transaction-detail-page__line-items">
                  <div className="transaction-detail-page__line-items-head">
                    <strong>Line Items</strong>
                    <span>{formatCurrencyAmount(receiptLineTotal, draft.currency)}</span>
                  </div>
                  {draft.receiptLineItems.map((item, index) => (
                    <div className="transaction-detail-page__line-item" key={`line-item-${index}`}>
                      <input aria-label={`Line item ${index + 1} name`} placeholder="Item name" value={item.description} onChange={(event) => updateLineItem(index, "description", event.target.value)} />
                      <input aria-label={`Line item ${index + 1} quantity`} placeholder="Qty" inputMode="decimal" value={item.quantity} onChange={(event) => updateLineItem(index, "quantity", event.target.value)} />
                      <input aria-label={`Line item ${index + 1} currency`} placeholder={draft.currency} value={item.currency} onChange={(event) => updateLineItem(index, "currency", event.target.value.toUpperCase())} />
                      <input aria-label={`Line item ${index + 1} amount`} placeholder="Amount" inputMode="decimal" value={item.amount} onChange={(event) => updateLineItem(index, "amount", event.target.value)} />
                      <button type="button" aria-label={`Remove line item ${index + 1}`} onClick={() => setDraft({ ...draft, receiptLineItems: draft.receiptLineItems.filter((_, itemIndex) => itemIndex !== index) })}>×</button>
                    </div>
                  ))}
                  <button className="button button-secondary button-small transaction-detail-page__add-line" type="button" onClick={() => setDraft({ ...draft, receiptLineItems: [...draft.receiptLineItems, { ...createEmptyReceiptLineItem(), currency: draft.currency }] })}>Add line item</button>
                </div>
                <div className="transaction-detail-page__confidence">
                  <span className={`transaction-detail-page__confidence-chip is-${confidenceScore >= 85 ? "high" : confidenceScore >= 65 ? "medium" : "low"}`}>{confidenceLabel}</span>
                  <strong>{confidenceScore}%</strong>
                </div>
                <p>Clover checks the merchant, account, category, duplicate risk, and parser result.</p>
              </div>
            </details>
            ) : (
              <details className="transaction-detail-page__more">
                <summary>Source and review details</summary>
                <div className="transaction-detail-page__more-body">
                  <div className="transaction-detail-page__confidence">
                    <span>Source</span>
                    <strong>{transaction.importFileId ? "Imported" : "Manual"}</strong>
                  </div>
                  <div className="transaction-detail-page__confidence">
                    <span className={`transaction-detail-page__confidence-chip is-${confidenceScore >= 85 ? "high" : confidenceScore >= 65 ? "medium" : "low"}`}>{confidenceLabel}</span>
                    <strong>{confidenceScore}%</strong>
                  </div>
                  <p>Clover keeps the original source separate from the details you confirm.</p>
                </div>
              </details>
            )}

            {!editing ? <TransactionCrossFeatureActions
              workspaceId={transaction.workspaceId}
              transactionId={transaction.id}
              transactionType={draft.type === "credit" ? "income" : draft.type === "transfer" ? "transfer" : "expense"}
              title={draft.merchantClean || transaction.merchantRaw}
              amount={draft.amount}
              currency={draft.currency}
              date={draft.date}
              accountId={draft.accountId}
              splitBillHref={transaction.splitBill ? `/split-bill?bill=${transaction.splitBill.id}` : null}
              splitBillOpen={splitBillOpen}
              onToggleSplitBill={transaction.splitBill ? undefined : () => setSplitBillOpen((current) => !current)}
            /> : null}
            {!editing && splitBillOpen && !transaction.splitBill ? (
              <div className="transaction-detail-page__split-bill">
                <SplitBillTransactionLinkFields
                  workspaceId={transaction.workspaceId}
                  draft={splitBillDraft}
                  onChange={setSplitBillDraft}
                  open={splitBillOpen}
                  title="Add transaction to Split Bills"
                  helperText="Choose a group or add the people sharing this transaction."
                  actionLabel="Create split bill"
                  onAction={createSplitBill}
                  actionBusy={splitBillSaving}
                  actionDisabled={!splitBillDraft.groupId && splitBillDraft.participantNames.length === 0}
                />
              </div>
            ) : null}

            {message ? <p className="transaction-detail-page__message" role="status">{message}</p> : null}
            <footer className={`transaction-detail-page__actions ${editing ? "is-editing" : confirmingDelete ? "is-confirming-delete" : ""}`}>
              {editing ? (
                <>
                  <button className="button button-secondary" type="button" onClick={cancelEdit} disabled={saving}>Cancel</button>
                  <button className="button button-primary" type="submit" disabled={saving}>{saving ? "Saving..." : "Save changes"}</button>
                </>
              ) : confirmingDelete ? (
                <div className="transaction-detail-page__delete-confirm" role="alert">
                  <span>Delete this transaction?</span>
                  <button className="button button-secondary button-small" type="button" onClick={() => setConfirmingDelete(false)}>Cancel</button>
                  <button className="button button-danger button-small" type="button" onClick={() => void deleteTransaction()} disabled={saving}>Delete</button>
                </div>
              ) : null}
            </footer>
          </form>
        ) : null}
      </main>
    </CloverShell>
  );
}
