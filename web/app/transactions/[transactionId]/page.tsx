"use client";
import { usePendingReceiptDetails } from "@/lib/use-pending-receipt-details";
import { TransactionDetailLabel } from "@/components/transaction-detail-label";

import { getTransactionReviewReasons } from "@/lib/transaction-review-reasons";
import { getRecordedTransactionConfidence } from "@/lib/transaction-confidence";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { CloverShell } from "@/components/clover-shell";
import { AccountBrandMark } from "@/components/account-brand-mark";
import { CategoryBrandMark } from "@/components/category-brand-mark";
import { TransactionAccountPicker, type TransactionPickerAccount } from "@/components/transaction-account-picker";
import { TransactionCategoryPicker } from "@/components/transaction-category-picker";
import { TransactionTagsEditor } from "@/components/transaction-tags-editor";
import { CurrencySelector } from "@/components/currency-selector";
import { SplitBillTransactionLinkFields } from "@/components/split-bill-transaction-link-fields";
import { TransactionCrossFeatureActions } from "@/components/transaction-cross-feature-actions";
import { getAccountBrand } from "@/lib/account-brand";
import type { AccountType } from "@/lib/domain-types";
import { mergeRefreshedTransactionDetailDraft, buildTransactionDetailDraft, type TransactionDetailDraftValue } from "@/lib/transaction-detail-draft";
import { buildTransactionUpdatePayload } from "@/lib/transaction-update-payload";
import { getCurrencyCatalogCodes } from "@/lib/currencies";
import { formatCurrencyAmount } from "@/lib/currency-format";
import { formatAccountOptionLabel } from "@/lib/account-option-label";
import { getTransactionParsedNoteValue } from "@/lib/transaction-notes";
import { clearJsonRequestCache } from "@/lib/request-dedupe";
import {
  createEmptyReceiptLineItem,
  getManualReceiptLineItemTotal,
  getReceiptLineItemComputedAmount,
} from "@/lib/receipt-line-items";
import { createSplitBillFromTransaction, type SplitBillTransactionLinkDraft } from "@/lib/split-bill-transaction-link";

type Transaction = {
  createdAt?: string;
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
  importFileName?: string | null;
  rawPayload?: unknown;
  normalizedPayload?: unknown;
  reviewStatus?: string | null;
  parserConfidence?: number | null;
  categoryConfidence?: number | null;
  accountMatchConfidence?: number | null;
  duplicateConfidence?: number | null;
  transferConfidence?: number | null;
  splitBill?: { id: string; title: string } | null;
  tags?: Array<{ id: string; name: string }>;
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

const getConfidenceScore = (transaction: Transaction) =>
  getRecordedTransactionConfidence(transaction) ?? (transaction.source === "manual" ? 100 : 80);

export default function TransactionDetailPage() {
  const params = useParams<{ transactionId: string }>();
  const router = useRouter();
  const transactionId = typeof params?.transactionId === "string" ? params.transactionId : "";
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [draft, setDraft] = useState<TransactionDetailDraftValue | null>(null);
  const [tagDraft, setTagDraft] = useState<string[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("edit") === "1") setEditing(true);
  }, [transactionId]);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [splitBillOpen, setSplitBillOpen] = useState(false);
  const [splitBillSaving, setSplitBillSaving] = useState(false);
  const [splitBillDraft, setSplitBillDraft] = useState<SplitBillTransactionLinkDraft>({ groupId: "", participantNames: [] });
  const pendingEditFieldRef = useRef<string | null>(null);

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
        setTagDraft((nextTransaction.tags ?? []).map((tag) => tag.name));
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

  usePendingReceiptDetails(transaction, (fresh, baseline) => {
    const draftFor = (entry: Transaction) => buildTransactionDetailDraft(entry, {
      merchantClean: entry.merchantClean ?? entry.merchantRaw,
      effectiveType: entry.type,
      categoryId: entry.categoryId,
      isTransfer: entry.type === "transfer" || entry.isTransfer,
    });
    setTransaction((current) => current?.id === fresh.id ? fresh : current);
    setDraft((current) => current ? mergeRefreshedTransactionDetailDraft(current, draftFor(baseline), draftFor(fresh)) : current);
  });

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
  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === draft?.accountId) ?? null,
    [accounts, draft?.accountId]
  );
  const accountForDisplay = useMemo<AccountOption>(
    () => selectedAccount ?? {
      id: "",
      name: transaction?.accountName ?? "Account",
      institution: transaction?.institution ?? null,
      accountNumber: transaction?.accountNumber ?? null,
      type: "bank",
      currency: draft?.currency ?? "PHP",
    },
    [draft?.currency, selectedAccount, transaction?.accountName, transaction?.accountNumber, transaction?.institution]
  );
  const accountDisplayName = displayAccountName(accountForDisplay);
  const accountBrand = getAccountBrand(accountForDisplay);
  const accountPickerOptions = useMemo<TransactionPickerAccount[]>(
    () =>
      accounts
        .filter((account) => account.type !== "investment")
        .map((account) => ({
          id: account.id,
          label: formatAccountOptionLabel(account, displayAccountName(account)),
          subtitle: account.institution ?? account.type.replaceAll("_", " "),
          brand: getAccountBrand(account),
        })),
    [accounts]
  );
  const confidenceScore = transaction ? getConfidenceScore(transaction) : 0;
  const confidenceLabel = confidenceScore >= 85 ? "High confidence" : confidenceScore >= 65 ? "Medium confidence" : "Low confidence";
  const receiptLineTotal = useMemo(() => getManualReceiptLineItemTotal(draft?.receiptLineItems ?? []), [draft?.receiptLineItems]);

  const beginEditing = (field: string) => {
    pendingEditFieldRef.current = field;
    setEditing(true);
  };

  useEffect(() => {
    if (!editing || !pendingEditFieldRef.current) {
      return;
    }

    const field = pendingEditFieldRef.current;
    pendingEditFieldRef.current = null;
    const frame = window.requestAnimationFrame(() => {
      const container = document.querySelector<HTMLElement>(`[data-transaction-detail-field="${field}"]`);
      const control = container?.matches("input, textarea, select, button")
        ? container
        : container?.querySelector<HTMLElement>("input, textarea, select, button");
      control?.focus();
      if ((field === "account" || field === "category") && control instanceof HTMLButtonElement) {
        control.click();
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [editing]);

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
        body: JSON.stringify({ ...buildTransactionUpdatePayload(draft, transaction), tags: tagDraft }),
      });
      const payload = (await response.json().catch(() => ({}))) as DetailPayload;
      if (!response.ok || !payload.transaction) {
        throw new Error(payload.error || "Unable to save transaction.");
      }

      const updated = payload.transaction;
      clearJsonRequestCache(`transactions:list:${updated.workspaceId}:`);
      window.dispatchEvent(new CustomEvent("clover:transactions-changed", { detail: { workspaceId: updated.workspaceId } }));
      setTransaction(updated);
      setTagDraft((updated.tags ?? []).map((tag) => tag.name));
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
    setTagDraft((transaction.tags ?? []).map((tag) => tag.name));
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
    <CloverShell active="transactions" title="Transaction Details" showTopbar={false} mobileBackHref="/transactions" mobileTrailingAction={<button className="icon-button" type="button" aria-label="Close transaction details" onClick={goBack}><span aria-hidden="true">×</span></button>}>
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
                <button className="button button-secondary button-small transaction-detail-page__edit-button" type="button" onClick={() => setEditing(true)}>Edit</button>
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

            <section className="transaction-detail-page__facts transaction-detail-page__facts--inline">
              {(["type", "name", "account", "category", "tags", "date", "amount", "notes"] as const).map(field => {
                const label = field[0].toUpperCase() + field.slice(1);
                const value = field === "type" ? draft.type === "credit" ? "Income" : draft.type === "transfer" ? "Transfer" : "Expense" : field === "name" ? draft.merchantClean || transaction.merchantRaw : field === "account" ? accountDisplayName : field === "category" ? selectedCategory?.name ?? transaction.categoryName ?? "Other" : field === "tags" ? tagDraft.join(", ") || "No tags" : field === "date" ? new Date(`${draft.date}T00:00:00`).toLocaleDateString("en-PH", {month:"long",day:"numeric",year:"numeric"}) : field === "amount" ? formatCurrencyAmount(Number(draft.amount || 0), draft.currency) : draft.description.trim() || "No notes";
                return <div className="transaction-detail-page__inline-row" data-transaction-detail-field={field} key={field}>
                  <span className="transaction-detail-page__inline-label">{field === "account" ? <><span className="transaction-detail-brand"><AccountBrandMark accountBrand={accountBrand} label="" /></span>Account</> : field === "category" ? <><CategoryBrandMark categoryName={selectedCategory?.name ?? transaction.categoryName ?? "Other"} size={24} />Category</> : <TransactionDetailLabel label={label} />}</span>
                  {editing ? <div className="transaction-detail-page__inline-control">{
                    field === "account" ? <TransactionAccountPicker accounts={accountPickerOptions} selectedId={draft.accountId} onSelect={account => setDraft({...draft,accountId:account.id})} ariaLabel="Choose transaction account" /> :
                    field === "category" ? <TransactionCategoryPicker categories={categories} selectedId={draft.categoryId} onSelect={category => setDraft({...draft,categoryId:category.id})} ariaLabel="Choose transaction category" /> :
                    field === "type" ? <select aria-label="Transaction type" value={draft.type} onChange={event => setDraft({...draft,type:event.target.value as "debit" | "credit" | "transfer",isTransfer:event.target.value === "transfer"})}><option value="debit">Expense</option><option value="credit">Income</option><option value="transfer">Transfer</option></select> :
                    field === "tags" ? <TransactionTagsEditor tags={tagDraft} onChange={setTagDraft} inputAriaLabel="Add tags to transaction" /> :
                    field === "notes" ? <textarea aria-label="Notes" value={draft.description} onChange={event => setDraft({...draft,description:event.target.value})} /> :
                    field === "amount" ? <span className="transaction-detail-page__money-control"><CurrencySelector value={draft.currency} onChange={currency => setDraft({...draft,currency})} options={getCurrencyCatalogCodes()} ariaLabel="Select transaction currency" /><input id="transaction-detail-amount" type="number" aria-label="Amount" min="0" step="0.01" value={draft.amount} onChange={event => setDraft({...draft,amount:event.target.value})} /></span> :
                    <input aria-label={label} type={field === "date" ? "date" : "text"} value={field === "date" ? draft.date : draft.merchantClean} onChange={event => setDraft({...draft,[field === "date" ? "date" : "merchantClean"]:event.target.value})} />
                  }</div> : <button type="button" onClick={() => beginEditing(field)}>{value}</button>}
                </div>;
              })}
            </section>

            {editing ? (
            <details className="transaction-detail-page__more" open>
              <summary>More</summary>
              <div className="transaction-detail-page__more-body">
                <div className="transaction-detail-page__line-items" data-transaction-detail-field="line-items">
                  <div className="transaction-detail-page__line-items-head">
                    <strong>Line Items</strong>
                    <span>{formatCurrencyAmount(receiptLineTotal, draft.currency)}</span>
                  </div>
                  {draft.receiptLineItems.length > 0 && Math.abs(receiptLineTotal - Number(draft.amount || 0)) > 0.005 ? <p role="status">Line items do not match the transaction total. Check for missing items, tax, or discounts. You can still save.</p> : null}
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
                    {transaction.importFileId ? <p>{transaction.importFileName ?? transaction.importFileId}</p> : null}
                  </div>
                  <div className="transaction-detail-page__confidence">
                    <span className={`transaction-detail-page__confidence-chip is-${confidenceScore >= 85 ? "high" : confidenceScore >= 65 ? "medium" : "low"}`}>{confidenceLabel}</span>
                    <strong>{confidenceScore}%</strong>
                  </div>
                  <section aria-label="Parsed information">
                    <h3>Parsed information</h3>
                    <p>{getTransactionParsedNoteValue(transaction) || transaction.merchantRaw || "No parsed information available."}</p>
                  </section>
                </div>
              </details>
            )}

            {!editing ? (
              <details className="transaction-detail-page__line-items-view transaction-line-items-accordion">
                <summary className="transaction-detail-page__line-items-head">
                  <strong>Line Items</strong>
                  <span>{formatCurrencyAmount(receiptLineTotal, draft.currency)}</span>
                </summary>
                {draft.receiptLineItems.length > 0 ? (
                  <div className="transaction-detail-page__line-items-list">
                    {draft.receiptLineItems.map((item, index) => (
                      <button type="button" key={`visible-line-item-${index}`} onClick={() => beginEditing("line-items")}>
                        <span>
                          <strong>{item.description.trim() || `Line item ${index + 1}`}</strong>
                          <small>{Number(item.quantity || 1) === 1 ? "1 item" : `${item.quantity} items`}</small>
                        </span>
                        <strong>{formatCurrencyAmount(getReceiptLineItemComputedAmount(item) ?? 0, item.currency || draft.currency)}</strong>
                      </button>
                    ))}
                  </div>
                ) : (
                  <button className="transaction-detail-page__line-items-empty" type="button" onClick={() => beginEditing("line-items")}>
                    No line items yet. Tap to add one.
                  </button>
                )}
                {draft.receiptLineItems.length > 0 ? <button className="button button-secondary button-small" type="button" onClick={() => beginEditing("line-items")}>Add line item</button> : null}
              </details>
            ) : null}

            {!editing && getTransactionReviewReasons(transaction).length > 0 ? (
              <section aria-label="Review warnings">
                <strong>Review warning</strong>
                <ul>{getTransactionReviewReasons(transaction).map((reason) => <li key={reason}>{reason}</li>)}</ul>
              </section>
            ) : null}

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

            {editing ? (
              <label>
                <input type="checkbox" checked={draft.isExcluded}
                  onChange={(event) => setDraft({ ...draft, isExcluded: event.target.checked })} />
                Exclude from totals
              </label>
            ) : transaction.isExcluded ? <p>Excluded from totals</p> : null}

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
              ) : (
                <button className="button button-danger button-small transaction-detail-page__delete-button" type="button" onClick={() => setConfirmingDelete(true)}>Delete transaction</button>
              )}
            </footer>
          </form>
        ) : null}
      </main>
    </CloverShell>
  );
}
