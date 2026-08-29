"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CategoryBrandMark } from "@/components/category-brand-mark";
import { CurrencySelector } from "@/components/currency-selector";
import { TransactionAccountPicker, type TransactionPickerAccount } from "@/components/transaction-account-picker";
import { TransactionCategoryPicker } from "@/components/transaction-category-picker";
import { TransactionTagsEditor } from "@/components/transaction-tags-editor";
import { getAccountBrand } from "@/lib/account-brand";
import { getCurrencyCatalogCodes } from "@/lib/currencies";
import { formatCurrencyAmount } from "@/lib/currency-format";
import type { AccountType } from "@/lib/domain-types";
import { buildTransactionDetailDraft, type TransactionDetailDraftValue } from "@/lib/transaction-detail-draft";
import { buildTransactionUpdatePayload } from "@/lib/transaction-update-payload";

export type HomeReviewTransaction = {
  id: string;
  title: string;
  date: string;
  amount: string;
  currency: string;
  type: "income" | "expense" | "transfer";
  accountName: string;
  categoryName: string | null;
  reviewReasons: string[];
};

type DetailTransaction = {
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
  transaction?: DetailTransaction;
  accounts?: AccountOption[];
  categories?: CategoryOption[];
  error?: string;
};

const detailCache = new Map<string, Promise<DetailPayload>>();

const loadTransactionDetail = (transactionId: string, force = false) => {
  if (force) detailCache.delete(transactionId);
  const cached = detailCache.get(transactionId);
  if (cached) return cached;

  const request = fetch(`/api/transactions/${encodeURIComponent(transactionId)}`, { cache: "no-store" })
    .then(async (response) => {
      const payload = (await response.json().catch(() => ({}))) as DetailPayload;
      if (!response.ok || !payload.transaction) {
        throw new Error(payload.error || "Unable to load transaction.");
      }
      return payload;
    })
    .catch((error) => {
      detailCache.delete(transactionId);
      throw error;
    });

  detailCache.set(transactionId, request);
  return request;
};

export const prefetchHomeTransactionDetail = (transactionId: string) =>
  loadTransactionDetail(transactionId).then(() => undefined);

const displayAccountName = (account: AccountOption) => {
  const base = account.institution?.trim() || account.name.trim() || "Account";
  const digits = account.accountNumber?.replace(/\D/g, "") ?? "";
  return digits.length >= 4 ? `${base} ${digits.slice(-4)}` : base;
};

const createDraft = (transaction: DetailTransaction) =>
  buildTransactionDetailDraft(transaction, {
    merchantClean: transaction.merchantClean ?? transaction.merchantRaw,
    effectiveType: transaction.type,
    categoryId: transaction.categoryId,
    isTransfer: transaction.type === "transfer" || transaction.isTransfer,
  });

export function HomeTransactionDetailModal({
  selected,
  onClose,
}: {
  selected: HomeReviewTransaction;
  onClose: () => void;
}) {
  const router = useRouter();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [detail, setDetail] = useState<DetailTransaction | null>(null);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [draft, setDraft] = useState<TransactionDetailDraftValue | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === draft?.categoryId) ?? null,
    [categories, draft?.categoryId]
  );
  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === draft?.accountId) ?? null,
    [accounts, draft?.accountId]
  );
  const accountPickerOptions = useMemo<TransactionPickerAccount[]>(
    () => accounts.map((account) => ({
      id: account.id,
      label: displayAccountName(account),
      subtitle: account.institution ?? account.type.replaceAll("_", " "),
      brand: getAccountBrand(account),
    })),
    [accounts]
  );

  const hydrateDetail = (force = false) => {
    setDetail(null);
    setDraft(null);
    setAccounts([]);
    setCategories([]);
    setTags([]);
    setEditing(false);
    setMessage("");
    setLoading(true);

    void loadTransactionDetail(selected.id, force)
      .then((payload) => {
        const next = payload.transaction!;
        setDetail(next);
        setAccounts(payload.accounts ?? []);
        setCategories(payload.categories ?? []);
        setDraft(createDraft(next));
        setTags((next.tags ?? []).map((tag) => tag.name));
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load transaction."))
      .finally(() => setLoading(false));
  };

  const closeDetail = () => {
    if (saving) return;
    setEditing(false);
    setMessage("");
    onClose();
  };

  useEffect(() => {
    hydrateDetail();
  }, [selected.id]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.setAttribute("data-clover-page-modal", "home-transaction-detail");
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) {
        event.preventDefault();
        closeDetail();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.removeAttribute("data-clover-page-modal");
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [saving, selected.id]);

  const cancelEdit = () => {
    if (!detail) return;
    setDraft(createDraft(detail));
    setTags((detail.tags ?? []).map((tag) => tag.name));
    setEditing(false);
    setMessage("");
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!detail || !draft || saving) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/transactions/${encodeURIComponent(detail.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...buildTransactionUpdatePayload(draft, detail), tags }),
      });
      const payload = (await response.json().catch(() => ({}))) as DetailPayload;
      if (!response.ok || !payload.transaction) {
        throw new Error(payload.error || "Unable to save transaction.");
      }

      const updated = payload.transaction;
      setDetail(updated);
      setDraft(createDraft(updated));
      setTags((updated.tags ?? []).map((tag) => tag.name));
      detailCache.set(updated.id, Promise.resolve({ ...payload, transaction: updated, accounts, categories }));
      setEditing(false);
      setMessage("Transaction saved across Clover.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save transaction.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop modal-backdrop--transaction-detail" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) closeDetail();
    }}>
          <section className="modal-card modal-card--wide transaction-drawer transaction-drawer--sidepanel home-transaction-detail" role="dialog" aria-modal="true" aria-labelledby="home-transaction-detail-title">
            <div className="modal-head transaction-drawer__head">
              <div className="transaction-drawer__head-title">
                <div>
                  <p className="eyebrow">Transaction Details</p>
                  <h4 id="home-transaction-detail-title">{draft?.merchantClean || detail?.merchantClean || selected.title}</h4>
                </div>
              </div>
              <div className="transaction-drawer__head-actions">
                {detail && !editing ? <button className="button button-secondary button-small" type="button" onClick={() => setEditing(true)}>Edit</button> : null}
                <button ref={closeButtonRef} className="icon-button" type="button" onClick={closeDetail} aria-label="Close transaction details">×</button>
              </div>
            </div>

            {selected.reviewReasons.length > 0 ? (
              <div className="home-transaction-detail__reason" role="note">
                <strong>Why Clover flagged this</strong>
                <span>{selected.reviewReasons.join(" · ")}</span>
              </div>
            ) : null}

            <div className={`transaction-drawer-view__amount is-${draft?.type ?? (selected.type === "income" ? "credit" : selected.type === "transfer" ? "transfer" : "debit")}`}>
              <CategoryBrandMark categoryName={selectedCategory?.name ?? detail?.categoryName ?? selected.categoryName ?? "Other"} size={34} radius={11} />
              <strong>{formatCurrencyAmount(Number(draft?.amount ?? detail?.amount ?? selected.amount), draft?.currency ?? detail?.currency ?? selected.currency)}</strong>
              <em>{new Date(draft?.date ?? detail?.date ?? selected.date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}</em>
            </div>

            {loading ? (
              <div className="home-transaction-detail__loading" role="status"><span className="transaction-detail-page__spinner" aria-hidden="true" />Loading editable details…</div>
            ) : message && !detail ? (
              <div className="home-transaction-detail__loading" role="alert">
                <span>{message}</span>
                <button className="button button-secondary button-small" type="button" onClick={() => hydrateDetail(true)}>Try again</button>
              </div>
            ) : detail && draft ? (
              <form className="home-transaction-detail__form" onSubmit={save}>
                {editing ? (
                  <div className="transaction-detail-page__fields">
                    <div className="transaction-detail-page__type-section">
                      <span>Transaction type</span>
                      <div className="transactions-manual-type-toggle" role="group" aria-label="Transaction type">
                        {([
                          { value: "debit", label: "Expense", icon: "−" },
                          { value: "credit", label: "Income", icon: "+" },
                          { value: "transfer", label: "Transfer", icon: "↔" },
                        ] as const).map((option) => (
                          <button key={option.value} type="button" className={`transactions-manual-type-toggle__button ${draft.type === option.value ? "is-active" : ""}`} aria-pressed={draft.type === option.value} onClick={() => setDraft({ ...draft, type: option.value, isTransfer: option.value === "transfer" })}>
                            <span aria-hidden="true">{option.icon}</span><span>{option.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <label>Name<input value={draft.merchantClean} onChange={(event) => setDraft({ ...draft, merchantClean: event.target.value })} /></label>
                    <label>Date<input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></label>
                    <label>Account<TransactionAccountPicker accounts={accountPickerOptions} selectedId={draft.accountId} onSelect={(account) => setDraft({ ...draft, accountId: account.id })} ariaLabel="Choose transaction account" className="transaction-detail-page__relation-picker" /></label>
                    <label>Category<TransactionCategoryPicker categories={categories} selectedId={draft.categoryId} onSelect={(category) => setDraft({ ...draft, categoryId: category.id })} ariaLabel="Choose transaction category" className="transaction-detail-page__relation-picker" /></label>
                    <div className="transaction-detail-page__tags-field"><span>Tags</span><TransactionTagsEditor tags={tags} onChange={setTags} placeholder="Examples: Work, Family" inputAriaLabel="Add tags to transaction" /></div>
                    <label>Amount<span className="transaction-detail-page__money-control"><CurrencySelector value={draft.currency} onChange={(currency) => setDraft({ ...draft, currency })} options={getCurrencyCatalogCodes()} ariaLabel="Select transaction currency" /><input type="number" min="0" step="0.01" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} /></span></label>
                    <label className="transaction-detail-page__notes">Notes<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Optional note" /></label>
                  </div>
                ) : (
                  <dl className="transaction-drawer-view__facts">
                    <div><dt>Type</dt><dd>{draft.type === "credit" ? "Income" : draft.type === "transfer" ? "Transfer" : "Expense"}</dd></div>
                    <div><dt>Account</dt><dd>{selectedAccount ? displayAccountName(selectedAccount) : detail.accountName}</dd></div>
                    <div><dt>Category</dt><dd>{selectedCategory?.name ?? detail.categoryName ?? "Other"}</dd></div>
                    <div><dt>Tags</dt><dd>{tags.length ? tags.join(", ") : "No tags"}</dd></div>
                    <div><dt>Notes</dt><dd>{draft.description.trim() || "No notes"}</dd></div>
                  </dl>
                )}

                {message ? <p className="transaction-detail-page__message" role="status">{message}</p> : null}
                {editing ? (
                  <div className="transaction-drawer-edit-footer">
                    <button className="button button-secondary" type="button" onClick={cancelEdit} disabled={saving}>Cancel</button>
                    <button className="button button-primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
                  </div>
                ) : null}
              </form>
            ) : null}
      </section>
    </div>
  );
}
