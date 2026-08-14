"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { CloverShell } from "@/components/clover-shell";
import { CategoryBrandMark } from "@/components/category-brand-mark";
import { CurrencySelector } from "@/components/currency-selector";
import { buildTransactionDetailDraft, type TransactionDetailDraftValue } from "@/lib/transaction-detail-draft";
import { buildTransactionUpdatePayload } from "@/lib/transaction-update-payload";
import { getCurrencyCatalogCodes } from "@/lib/currencies";
import { formatCurrencyAmount } from "@/lib/currency-format";

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
};

type AccountOption = {
  id: string;
  name: string;
  institution: string | null;
  accountNumber: string | null;
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

const typeSymbol = (type: TransactionDetailDraftValue["type"]) =>
  type === "credit" ? "+" : type === "transfer" ? "↔" : "-";

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
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save transaction.");
    } finally {
      setSaving(false);
    }
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
            <span>Transactions</span>
          </button>
          <div>
            <p className="eyebrow">Transaction Details</p>
            <h1>{transaction?.merchantClean ?? transaction?.merchantRaw ?? "Transaction"}</h1>
          </div>
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

            <section className="transaction-detail-page__fields">
              <label>
                Name
                <input value={draft.merchantClean} onChange={(event) => setDraft({ ...draft, merchantClean: event.target.value })} />
              </label>
              <label>
                Date
                <input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} />
              </label>
              <label>
                Type
                <span className="transaction-detail-page__type-control">
                  <span aria-hidden="true">{typeSymbol(draft.type)}</span>
                  <select
                    value={draft.type}
                    onChange={(event) => {
                      const type = event.target.value as TransactionDetailDraftValue["type"];
                      setDraft({ ...draft, type, isTransfer: type === "transfer" });
                    }}
                  >
                    <option value="debit">Expense</option>
                    <option value="credit">Income</option>
                    <option value="transfer">Transfer</option>
                  </select>
                </span>
              </label>
              <label>
                Account
                <select value={draft.accountId} onChange={(event) => setDraft({ ...draft, accountId: event.target.value })}>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>{displayAccountName(account)}</option>
                  ))}
                </select>
              </label>
              <label>
                Category
                <select value={draft.categoryId} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}>
                  <option value="">Other</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
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
              <label className="transaction-detail-page__notes">
                Notes
                <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Optional note" />
              </label>
            </section>

            <details className="transaction-detail-page__source">
              <summary>Source Details</summary>
              <dl>
                <div><dt>Original Name</dt><dd>{transaction.merchantRaw}</dd></div>
                <div><dt>Source</dt><dd>{transaction.source === "upload" ? "Imported file" : transaction.source || "Manual"}</dd></div>
                <div><dt>Account</dt><dd>{transaction.accountName}</dd></div>
              </dl>
            </details>

            {message ? <p className="transaction-detail-page__message" role="status">{message}</p> : null}
            <footer className="transaction-detail-page__actions">
              {confirmingDelete ? (
                <div className="transaction-detail-page__delete-confirm" role="alert">
                  <span>Delete this transaction?</span>
                  <button className="button button-secondary button-small" type="button" onClick={() => setConfirmingDelete(false)}>Cancel</button>
                  <button className="button button-danger button-small" type="button" onClick={() => void deleteTransaction()} disabled={saving}>Delete</button>
                </div>
              ) : (
                <button className="button button-danger button-small" type="button" onClick={() => setConfirmingDelete(true)}>Delete</button>
              )}
              <button className="button button-primary button-small" type="submit" disabled={saving}>{saving ? "Saving..." : "Save Changes"}</button>
            </footer>
          </form>
        ) : null}
      </main>
    </CloverShell>
  );
}
