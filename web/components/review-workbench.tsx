"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { capturePostHogClientEvent } from "@/components/posthog-analytics";
import type { AnalyticsEventName } from "@/lib/analytics";

type ReviewAccount = {
  id: string;
  name: string;
};

type ReviewCategory = {
  id: string;
  name: string;
  type: "income" | "expense" | "transfer";
};

type ReviewTransaction = {
  id: string;
  accountId: string;
  accountName: string;
  categoryId: string | null;
  categoryName: string | null;
  reviewStatus: "pending_review" | "suggested" | "confirmed" | "edited" | "rejected" | "duplicate_skipped";
  parserConfidence: number;
  categoryConfidence: number;
  accountMatchConfidence: number;
  duplicateConfidence: number;
  transferConfidence: number;
  date: string;
  amount: string;
  currency: string;
  type: "income" | "expense" | "transfer";
  merchantRaw: string;
  merchantClean: string | null;
  description: string | null;
  isTransfer: boolean;
  isExcluded: boolean;
};

type Draft = {
  accountId: string;
  categoryId: string;
  description: string;
};

type ReviewWorkbenchProps = {
  workspaceId: string;
  workspaceName: string;
  transactions: ReviewTransaction[];
  accounts: ReviewAccount[];
  categories: ReviewCategory[];
};

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("en-PH", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });

const confidenceTone = (value: number) => {
  if (value < 40) return "danger";
  if (value < 70) return "warn";
  return "good";
};

const confidenceLabel = (value: number) => {
  if (value >= 90) return "High confidence";
  if (value >= 70) return "Moderate confidence";
  return "Needs attention";
};

const nextItemId = (items: ReviewTransaction[], currentId: string) => {
  const currentIndex = items.findIndex((item) => item.id === currentId);
  if (currentIndex === -1) return null;
  return items[currentIndex + 1]?.id ?? items[currentIndex - 1]?.id ?? null;
};

export function ReviewWorkbench({ workspaceId, workspaceName, transactions, accounts, categories }: ReviewWorkbenchProps) {
  const [items, setItems] = useState(transactions);
  const [selectedId, setSelectedId] = useState(transactions[0]?.id ?? null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const current = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);
  const currentDraft = current
    ? drafts[current.id] ?? {
        accountId: current.accountId,
        categoryId: current.categoryId ?? "",
        description: current.description ?? "",
      }
    : null;
  const currentCategory = currentDraft?.categoryId ? categories.find((category) => category.id === currentDraft.categoryId) : null;
  const currentAccount = currentDraft?.accountId ? accounts.find((account) => account.id === currentDraft.accountId) : null;
  const currentCategoryName = currentCategory?.name ?? current?.categoryName ?? "Uncategorized";
  const currentAccountName = currentAccount?.name ?? current?.accountName ?? "Unknown account";
  const currentAmount = current ? Number(current.amount) : 0;
  const draftChanged = (() => {
    if (!current || !currentDraft) {
      return false;
    }

    return (
      currentDraft.accountId !== current.accountId ||
      currentDraft.categoryId !== (current.categoryId ?? "") ||
      currentDraft.description.trim() !== (current.description ?? "").trim()
    );
  })();

  const reasons = useMemo(() => {
    if (!current) return [];

    const items: Array<{ label: string; tone: "good" | "warn" | "danger" }> = [];
    if (current.reviewStatus === "pending_review") items.push({ label: "Pending review", tone: "warn" });
    if (current.categoryId === null) items.push({ label: "No category", tone: "danger" });
    if (current.categoryConfidence < 70) {
      items.push({
        label: `Category confidence ${current.categoryConfidence}%`,
        tone: confidenceTone(current.categoryConfidence),
      });
    }
    if (current.accountMatchConfidence < 70) {
      items.push({
        label: `Account confidence ${current.accountMatchConfidence}%`,
        tone: confidenceTone(current.accountMatchConfidence),
      });
    }
    if (current.duplicateConfidence >= 50) {
      items.push({
        label: `Duplicate risk ${current.duplicateConfidence}%`,
        tone: confidenceTone(current.duplicateConfidence),
      });
    }
    if (current.transferConfidence >= 50 || current.isTransfer) {
      items.push({
        label: `Transfer confidence ${current.transferConfidence}%`,
        tone: confidenceTone(current.transferConfidence),
      });
    }

    return items;
  }, [current]);

  const reasonDetails = useMemo(() => {
    if (!current) return [];

    const items: Array<{ label: string; detail: string; tone: "good" | "warn" | "danger" }> = [];
    if (current.reviewStatus === "pending_review") {
      items.push({
        label: "Pending review",
        detail: "This row was flagged by the import pipeline and needs a quick decision.",
        tone: "warn",
      });
    }
    if (current.categoryId === null) {
      items.push({
        label: "Missing category",
        detail: "The system could not confidently place this transaction into a category.",
        tone: "danger",
      });
    } else if (current.categoryConfidence < 70) {
      items.push({
        label: "Low category confidence",
        detail: "The guessed category is plausible, but not strong enough to confirm automatically.",
        tone: confidenceTone(current.categoryConfidence),
      });
    }
    if (current.accountMatchConfidence < 70) {
      items.push({
        label: "Low account confidence",
        detail: "The source account match is uncertain and should be confirmed before it becomes trusted data.",
        tone: confidenceTone(current.accountMatchConfidence),
      });
    }
    if (current.duplicateConfidence >= 50) {
      items.push({
        label: "Possible duplicate",
        detail: "Another transaction with the same date, amount, and merchant may already exist.",
        tone: confidenceTone(current.duplicateConfidence),
      });
    }
    if (current.transferConfidence >= 50 || current.isTransfer) {
      items.push({
        label: "Possible transfer",
        detail: "This looks like a transfer, so it needs a human check before it counts as spending.",
        tone: confidenceTone(current.transferConfidence),
      });
    }

    return items;
  }, [current]);

  const primaryReason = reasonDetails[0] ?? null;

  const summary = useMemo(() => {
    return items.reduce(
      (accumulator, transaction) => {
        accumulator.total += 1;
        if (transaction.reviewStatus === "pending_review") accumulator.pending += 1;
        if (transaction.categoryConfidence < 70 || !transaction.categoryId) accumulator.lowConfidence += 1;
        if (transaction.accountMatchConfidence < 70) accumulator.lowAccount += 1;
        if (transaction.duplicateConfidence >= 50) accumulator.duplicateRisk += 1;
        return accumulator;
      },
      { total: 0, pending: 0, lowConfidence: 0, lowAccount: 0, duplicateRisk: 0 }
    );
  }, [items]);

  useEffect(() => {
    setItems(transactions);
    setSelectedId(transactions[0]?.id ?? null);
    setDrafts({});
    setStatus(null);
  }, [transactions]);

  useEffect(() => {
    if (!current) return;
    const handler = (event: KeyboardEvent) => {
      if (isSaving) {
        return;
      }

      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const key = event.key.toLowerCase();
      if (key === "j" || key === "n" || key === "arrowright") {
        event.preventDefault();
        const nextId = nextItemId(items, current.id);
        if (nextId) setSelectedId(nextId);
        return;
      }
      if (key === "k" || key === "p" || key === "arrowleft") {
        event.preventDefault();
        const currentIndex = items.findIndex((item) => item.id === current.id);
        setSelectedId(items[currentIndex - 1]?.id ?? current.id);
        return;
      }
      if (key === "a") {
        event.preventDefault();
        void resolveCurrent("confirmed");
        return;
      }
      if (key === "i") {
        event.preventDefault();
        void ignoreCurrent();
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [current, items, draftChanged, selectedId, isSaving]);

  const updateDraft = (patch: Partial<Draft>) => {
    if (!current) return;
    setDrafts((value) => ({
      ...value,
      [current.id]: {
        accountId: currentDraft?.accountId ?? current.accountId,
        categoryId: currentDraft?.categoryId ?? (current.categoryId ?? ""),
        description: currentDraft?.description ?? (current.description ?? ""),
        ...patch,
      },
    }));
  };

  const removeCurrentFromQueue = (transactionId: string, preferredNextId: string | null = null) => {
    setItems((currentItems) => {
      const currentIndex = currentItems.findIndex((item) => item.id === transactionId);
      const nextItems = currentItems.filter((item) => item.id !== transactionId);
      const nextId =
        preferredNextId && nextItems.some((item) => item.id === preferredNextId)
          ? preferredNextId
          : nextItems[currentIndex]?.id ?? nextItems[currentIndex - 1]?.id ?? nextItems[0]?.id ?? null;
      setSelectedId((currentSelectedId) => {
        if (currentSelectedId !== transactionId) return currentSelectedId;
        return nextId;
      });
      return nextItems;
    });
    setDrafts((value) => {
      const next = { ...value };
      delete next[transactionId];
      return next;
    });
  };

  const patchCurrent = async (body: Record<string, unknown>, message: string, eventName: AnalyticsEventName) => {
    if (!current) return;

    const transactionId = current.id;
    const preferredNextId = nextItemId(items, transactionId);
    const previousItems = items;
    const previousDrafts = { ...drafts };
    const previousSelectedId = selectedId;
    const reviewStatusValue = typeof body.reviewStatus === "string" ? body.reviewStatus : null;

    setIsSaving(true);
    removeCurrentFromQueue(transactionId, preferredNextId);
    setStatus("Saving changes...");

    try {
      const response = await fetch(`/api/transactions/${transactionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error("Unable to update transaction.");
      }

      capturePostHogClientEvent(eventName, {
        workspace_id: workspaceId,
        transaction_id: transactionId,
        review_status: reviewStatusValue,
      });
      setStatus(message);
    } catch (error) {
      setItems(previousItems);
      setDrafts(previousDrafts);
      setSelectedId(previousSelectedId);
      setStatus(error instanceof Error ? error.message : "Unable to update transaction.");
    } finally {
      setIsSaving(false);
    }
  };

  const resolveCurrent = async (reviewStatus: "confirmed" | "edited") => {
    if (!current || !currentDraft) return;

    const payload: Record<string, unknown> = {
      reviewStatus,
    };

    if (currentDraft.accountId && currentDraft.accountId !== current.accountId) {
      payload.accountId = currentDraft.accountId;
    }

    const nextCategoryId = currentDraft.categoryId || null;
    if ((nextCategoryId ?? null) !== (current.categoryId ?? null)) {
      payload.categoryId = nextCategoryId;
    }

    const nextDescription = currentDraft.description.trim();
    if (nextDescription !== (current.description ?? "").trim()) {
      payload.description = nextDescription || null;
    }

    await patchCurrent(
      payload,
      reviewStatus === "confirmed" ? "Resolved and confirmed." : "Changes saved for learning.",
      reviewStatus === "confirmed" ? "review_item_accepted" : "review_item_edited"
    );
  };

  const ignoreCurrent = async () => {
    if (!current) return;
    await patchCurrent(
      {
        isExcluded: true,
        reviewStatus: "rejected",
      },
      "Ignored and removed from the queue.",
      "review_item_rejected"
    );
  };

  if (!items.length || !current) {
    return (
      <div className="review-workbench review-workbench--empty glass">
        <div className="review-workbench__empty-copy">
          <p className="eyebrow">Review queue</p>
          <h3>Nothing needs attention right now</h3>
          <p>
            Clear review items are a good sign. When new uncertain transactions arrive, this page will bring them
            here so you can resolve them quickly.
          </p>
        </div>
      </div>
    );
  }

  const currentIndex = items.findIndex((item) => item.id === current.id);

  return (
    <section className="review-workbench glass" aria-label="Review workbench">
      <div className="review-workbench__head">
        <div>
          <p className="eyebrow">Review queue</p>
          <h3>Resolve uncertain transactions fast</h3>
          <p className="review-workbench__intro">
            {workspaceName} has {summary.total} actionable item{summary.total === 1 ? "" : "s"}. Confirm what is right,
            correct what is wrong, and let the model learn from every change.
          </p>
        </div>
        <div className="review-workbench__badge" title={primaryReason?.detail ?? undefined}>
          <strong>{currentIndex + 1}</strong>
          <span>of {summary.total}</span>
          {primaryReason ? <small className="review-workbench__badge-reason">{primaryReason.label}</small> : null}
        </div>
        <div className="review-workbench__progress" aria-label={`Review progress ${currentIndex + 1} of ${summary.total}`}>
          <span style={{ width: `${Math.max(4, Math.min(((currentIndex + 1) / Math.max(summary.total, 1)) * 100, 100))}%` }} />
        </div>
        <div className="review-workbench__shortcuts" aria-label="Review shortcuts">
          <span>← previous</span>
          <span>→ next</span>
          <span>A accept</span>
          <span>I ignore</span>
        </div>
      </div>

      <div className="status-card status-card--review review-workbench__summary">
        <div>
          <strong>{summary.total}</strong>
          <div className="panel-muted">actionable items</div>
        </div>
        <div className="status-stack">
          <span className="status status--processing">{summary.lowConfidence} low confidence</span>
          <span className="status">{summary.pending} pending review</span>
          <span className="status">{summary.lowAccount} low account confidence</span>
          <span className="status">{summary.duplicateRisk} duplicate risk</span>
        </div>
      </div>

      <div className="review-workbench__grid">
        <article className="review-workbench__card review-workbench__card--main review-workbench__card--active">
          <div className="review-workbench__transaction-head">
            <div>
              <p className="review-workbench__active-tag">Active review item</p>
              <p className="review-workbench__title">{current.merchantClean ?? current.merchantRaw}</p>
              {current.merchantClean && current.merchantRaw !== current.merchantClean ? (
                <p className="review-workbench__subtitle">{current.merchantRaw}</p>
              ) : current.description ? (
                <p className="review-workbench__subtitle">{current.description}</p>
              ) : null}
            </div>
            <span className={`pill pill-neutral review-workbench__status review-workbench__status--${confidenceTone(current.categoryConfidence)}`}>
              {confidenceLabel(current.categoryConfidence)}
            </span>
          </div>

          <div className="review-workbench__amount-row">
            <div>
              <span className="review-workbench__meta-label">Amount</span>
              <strong className={current.type === "income" ? "positive" : "negative"}>
                {currencyFormatter.format(currentAmount)}
              </strong>
            </div>
            <div>
              <span className="review-workbench__meta-label">Date</span>
              <strong>{formatDate(current.date)}</strong>
            </div>
            <div>
              <span className="review-workbench__meta-label">Type</span>
              <strong>{current.type === "income" ? "Credit" : current.type === "transfer" ? "Transfer" : "Debit"}</strong>
            </div>
          </div>

          <div className="review-workbench__reason-row">
            {reasons.map((reason) => (
              <span key={reason.label} className={`pill pill-subtle review-workbench__reason review-workbench__reason--${reason.tone}`}>
                {reason.label}
              </span>
            ))}
          </div>

          <div className="review-workbench__confidence-grid">
            <div className="review-workbench__confidence">
              <div className="review-workbench__confidence-head">
                <span>Category</span>
                <strong>{current.categoryConfidence}%</strong>
              </div>
              <div className="review-workbench__meter" aria-hidden="true">
                <span style={{ width: `${Math.max(6, Math.min(current.categoryConfidence, 100))}%` }} />
              </div>
            </div>
            <div className="review-workbench__confidence">
              <div className="review-workbench__confidence-head">
                <span>Account</span>
                <strong>{current.accountMatchConfidence}%</strong>
              </div>
              <div className="review-workbench__meter" aria-hidden="true">
                <span style={{ width: `${Math.max(6, Math.min(current.accountMatchConfidence, 100))}%` }} />
              </div>
            </div>
            <div className="review-workbench__confidence">
              <div className="review-workbench__confidence-head">
                <span>Transfer</span>
                <strong>{current.transferConfidence}%</strong>
              </div>
              <div className="review-workbench__meter" aria-hidden="true">
                <span style={{ width: `${Math.max(6, Math.min(current.transferConfidence, 100))}%` }} />
              </div>
            </div>
          </div>

          <div className="review-workbench__edit-grid">
            <label>
              Account
              <select value={currentDraft?.accountId ?? current.accountId} onChange={(event) => updateDraft({ accountId: event.target.value })}>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Category
              <select
                value={currentDraft?.categoryId ?? current.categoryId ?? ""}
                onChange={(event) => updateDraft({ categoryId: event.target.value })}
              >
                <option value="">Uncategorized</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="span-2">
              Notes
              <textarea
                value={currentDraft?.description ?? current.description ?? ""}
                onChange={(event) => updateDraft({ description: event.target.value })}
                placeholder="Add context, a reminder, or the corrected note"
              />
            </label>
          </div>

          {status ? <div className="review-workbench__notice">{status}</div> : null}
        </article>

        <aside className="review-workbench__card review-workbench__card--side">
          <div className="review-workbench__panel">
            <p className="eyebrow">Why here</p>
            <ul className="review-workbench__list">
              {reasonDetails.length > 0 ? (
                reasonDetails.map((reason) => (
                  <li key={reason.label} className={`review-workbench__reason-card review-workbench__reason-card--${reason.tone}`}>
                    <strong>{reason.label}</strong>
                    <span>{reason.detail}</span>
                  </li>
                ))
              ) : (
                <li className="review-workbench__reason-card review-workbench__reason-card--good">
                  <strong>Looks good</strong>
                  <span>No special flags are attached to this row, but it was surfaced for quick confirmation.</span>
                </li>
              )}
              <li>
                <strong>{current.accountName}</strong>
                <span>source account</span>
              </li>
              <li>
                <strong>{currentCategoryName}</strong>
                <span>current category</span>
              </li>
              <li>
                <strong>{current.reviewStatus.replaceAll("_", " ")}</strong>
                <span>review state</span>
              </li>
            </ul>
          </div>

          <div className="review-workbench__actions">
            <button
              className="button button-primary review-workbench__button-primary"
              type="button"
              onClick={() => void resolveCurrent("confirmed")}
              disabled={isSaving}
            >
              {draftChanged ? "Confirm and learn" : "Accept"}
            </button>
            <button
              className="button button-secondary review-workbench__button-secondary"
              type="button"
              onClick={() => void ignoreCurrent()}
              disabled={isSaving}
            >
              Ignore
            </button>
            <Link
              className="button button-secondary"
              href={`/transactions?review=${encodeURIComponent(current.id)}`}
              onClick={() => {
                capturePostHogClientEvent("review_item_opened", {
                  workspace_id: workspaceId,
                  transaction_id: current.id,
                  entry_point: "review_workbench",
                });
              }}
            >
              Open in Transactions
            </Link>
            {draftChanged ? (
              <p className="review-workbench__actions-copy">
                Confirming will save your edits and help the model learn from this correction.
              </p>
            ) : null}
          </div>

          <div className="review-workbench__nav">
            <button
              className="button button-secondary button-small"
              type="button"
              onClick={() => setSelectedId(items[currentIndex - 1]?.id ?? current.id)}
              disabled={currentIndex <= 0 || isSaving}
            >
              Previous
            </button>
            <button
              className="button button-secondary button-small"
              type="button"
              onClick={() => setSelectedId(items[currentIndex + 1]?.id ?? current.id)}
              disabled={currentIndex >= items.length - 1 || isSaving}
            >
              Next
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}
