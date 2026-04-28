"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { capturePostHogClientEvent } from "@/components/posthog-analytics";
import type { AnalyticsEventName } from "@/lib/analytics";
import { humanizeMerchantText, summarizeMerchantText } from "@/lib/merchant-labels";
import { formatTransactionDirectionLabel } from "@/lib/transaction-directions";

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

type ReviewQueueAction = "accept" | "fix" | "exclude";
type ReviewSignal = {
  label: string;
  detail: string;
  tone: "good" | "warn" | "danger";
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

const getReviewSignals = (transaction: ReviewTransaction): ReviewSignal[] => {
  const items: ReviewSignal[] = [];

  if (transaction.reviewStatus === "pending_review") {
    items.push({
      label: "Pending review",
      detail: "This row was flagged by the import pipeline and needs a quick decision.",
      tone: "warn",
    });
  }

  if (transaction.categoryId === null) {
    items.push({
      label: "Missing category",
      detail: "The system could not confidently place this transaction into a category.",
      tone: "danger",
    });
  } else if (transaction.categoryConfidence < 70) {
    items.push({
      label: "Low category confidence",
      detail: "The guessed category is plausible, but not strong enough to confirm automatically.",
      tone: confidenceTone(transaction.categoryConfidence),
    });
  }

  if (transaction.accountMatchConfidence < 70) {
    items.push({
      label: "Account mismatch",
      detail: "The account match is uncertain and should be confirmed before it becomes trusted data.",
      tone: confidenceTone(transaction.accountMatchConfidence),
    });
  }

  if (transaction.duplicateConfidence >= 50) {
    items.push({
      label: "Possible duplicate",
      detail: "Another transaction with the same date, amount, and merchant may already exist.",
      tone: confidenceTone(transaction.duplicateConfidence),
    });
  }

  if (transaction.transferConfidence >= 50 || transaction.isTransfer) {
    items.push({
      label: "Possible movement",
      detail: "This looks like a movement between accounts, so it needs a human check before it counts as spending.",
      tone: confidenceTone(transaction.transferConfidence),
    });
  }

  return items;
};

const buildDraftFromTransaction = (transaction: ReviewTransaction): Draft => ({
  accountId: transaction.accountId,
  categoryId: transaction.categoryId ?? "",
  description: transaction.description ?? "",
});

export function ReviewWorkbench({ workspaceId, workspaceName, transactions, accounts, categories }: ReviewWorkbenchProps) {
  const [items, setItems] = useState(transactions);
  const [selectedId, setSelectedId] = useState(transactions[0]?.id ?? null);
  const [selectedIds, setSelectedIds] = useState<string[]>(transactions[0]?.id ? [transactions[0].id] : []);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const current = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);
  const currentDraft = current ? drafts[current.id] ?? buildDraftFromTransaction(current) : null;
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

  const reasonDetails = useMemo(() => (current ? getReviewSignals(current) : []), [current]);
  const reasons = reasonDetails;

  const primaryReason = reasonDetails[0] ?? null;
  const selectedItems = useMemo(() => items.filter((item) => selectedIds.includes(item.id)), [items, selectedIds]);
  const selectedCount = selectedItems.length;
  const selectedContainsCurrent = current ? selectedIds.includes(current.id) : false;
  const canBatchFix = Boolean(current && selectedContainsCurrent && draftChanged && selectedCount > 0);

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

  const categorySignalLabel = current ? "Category confidence" : "Category";
  const accountSignalLabel = current ? (current.accountMatchConfidence < 70 ? "Account mismatch" : "Account match") : "Account";
  const duplicateSignalLabel = current ? "Duplicate risk" : "Duplicate";
  const transferSignalLabel = current ? "Movement risk" : "Movement";

  useEffect(() => {
    setItems(transactions);
    setSelectedId(transactions[0]?.id ?? null);
    setDrafts({});
    setStatus(null);
  }, [transactions]);

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

  const removeTransactionsFromQueue = (transactionIds: string[], preferredNextId: string | null = null) => {
    const removedIds = new Set(transactionIds);
    setItems((currentItems) => {
      const currentIndex = currentItems.findIndex((item) => removedIds.has(item.id));
      const nextItems = currentItems.filter((item) => !removedIds.has(item.id));
      const nextId =
        preferredNextId && nextItems.some((item) => item.id === preferredNextId)
          ? preferredNextId
          : nextItems[currentIndex]?.id ?? nextItems[currentIndex - 1]?.id ?? nextItems[0]?.id ?? null;
      setSelectedId((currentSelectedId) => {
        if (!removedIds.has(currentSelectedId)) return currentSelectedId;
        return nextId;
      });
      setSelectedIds((currentSelectedIds) => {
        const nextSelectedIds = currentSelectedIds.filter((id) => !removedIds.has(id));
        if (nextSelectedIds.length > 0) {
          return nextSelectedIds;
        }
        return nextId ? [nextId] : [];
      });
      return nextItems;
    });
    setDrafts((value) => {
      const next = { ...value };
      for (const transactionId of transactionIds) {
        delete next[transactionId];
      }
      return next;
    });
  };

  const toggleSelectedId = (transactionId: string) => {
    setSelectedIds((currentSelectedIds) =>
      currentSelectedIds.includes(transactionId)
        ? currentSelectedIds.filter((id) => id !== transactionId)
        : [...currentSelectedIds, transactionId]
    );
  };

  const selectAllQueueItems = () => {
    setSelectedIds(items.map((item) => item.id));
  };

  const clearSelection = () => {
    setSelectedIds([]);
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
    removeTransactionsFromQueue([transactionId], preferredNextId);
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

  const buildPayloadForTransaction = (
    transaction: ReviewTransaction,
    action: ReviewQueueAction,
    sourceDraft?: Draft | null
  ) => {
    if (action === "exclude") {
      return {
        body: {
          isExcluded: true,
          reviewStatus: "rejected" as const,
        },
        hasLearningChange: false,
      };
    }

    const draft = sourceDraft ?? drafts[transaction.id] ?? buildDraftFromTransaction(transaction);
    const body: Record<string, unknown> = {};
    const nextAccountId = draft.accountId;
    const nextCategoryId = draft.categoryId || null;
    const nextDescription = draft.description.trim();

    if (nextAccountId !== transaction.accountId) {
      body.accountId = nextAccountId;
    }
    if ((nextCategoryId ?? null) !== (transaction.categoryId ?? null)) {
      body.categoryId = nextCategoryId;
    }
    if (nextDescription !== (transaction.description ?? "").trim()) {
      body.description = nextDescription || null;
    }

    const hasLearningChange = Object.keys(body).length > 0;
    body.reviewStatus = hasLearningChange ? "edited" : "confirmed";

    return { body, hasLearningChange };
  };

  async function applyBatchAction(action: ReviewQueueAction) {
    const transactionIds = selectedIds.filter((id) => items.some((item) => item.id === id));
    if (!transactionIds.length || isSaving) {
      return;
    }

    const batchTargets = items.filter((item) => transactionIds.includes(item.id));
    const previousItems = items;
    const previousDrafts = { ...drafts };
    const previousSelectedId = selectedId;
    const previousSelectedIds = [...selectedIds];
    const preferredNextId = nextItemId(items, current?.id ?? transactionIds[0]);
    const acceptedCount = batchTargets.length;

    setIsSaving(true);
    removeTransactionsFromQueue(transactionIds, preferredNextId);
    setStatus("Saving review changes...");

    try {
      for (const transaction of batchTargets) {
        const sourceDraft =
          action === "fix"
            ? currentDraft
            : action === "accept"
              ? drafts[transaction.id] ?? buildDraftFromTransaction(transaction)
              : null;
        const { body, hasLearningChange } = buildPayloadForTransaction(transaction, action, sourceDraft);

        const response = await fetch(`/api/transactions/${transaction.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          throw new Error(`Unable to update ${transaction.merchantRaw}.`);
        }

        const payload = await response.json().catch(() => null);
        const updated = payload?.transaction as ReviewTransaction | undefined;

        if (updated) {
          setItems((currentItems) =>
            currentItems.map((item) =>
              item.id === updated.id
                ? {
                    ...item,
                    ...updated,
                  }
                : item
            )
          );
        }

        capturePostHogClientEvent(
          action === "exclude"
            ? "review_item_rejected"
            : hasLearningChange
              ? "review_item_edited"
              : "review_item_accepted",
          {
            workspace_id: workspaceId,
            transaction_id: transaction.id,
            review_status: body.reviewStatus as string,
          }
        );
      }

      if (action === "exclude") {
        setStatus(
          `${acceptedCount} item${acceptedCount === 1 ? "" : "s"} excluded from the queue and totals.`
        );
      } else if (action === "fix") {
        setStatus(
          `${acceptedCount} item${acceptedCount === 1 ? "" : "s"} corrected and sent to Clover's learning system.`
        );
      } else {
        setStatus(
          `${acceptedCount} item${acceptedCount === 1 ? "" : "s"} confirmed and reinforced Clover's learning signals.`
        );
      }
    } catch (error) {
      setItems(previousItems);
      setDrafts(previousDrafts);
      setSelectedId(previousSelectedId);
      setSelectedIds(previousSelectedIds);
      setStatus(error instanceof Error ? error.message : "Unable to update transactions.");
    } finally {
      setIsSaving(false);
    }
  }

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
      "Excluded and removed from the queue.",
      "review_item_rejected"
    );
  };

  useEffect(() => {
    if (!current) return;
    const handler = (event: KeyboardEvent) => {
      if (isSaving) {
        return;
      }

      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement ||
        event.target instanceof HTMLButtonElement ||
        event.target instanceof HTMLAnchorElement
      ) {
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
      if (key === "f") {
        event.preventDefault();
        if (canBatchFix) {
          void applyBatchAction("fix");
        }
        return;
      }
      if (key === "i") {
        event.preventDefault();
        void ignoreCurrent();
        return;
      }
      if (key === "x") {
        event.preventDefault();
        if (selectedCount > 0) {
          void applyBatchAction("exclude");
        }
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        toggleSelectedId(current.id);
        return;
      }
      if (key === "escape") {
        event.preventDefault();
        clearSelection();
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [applyBatchAction, canBatchFix, clearSelection, current, isSaving, items, selectedCount, resolveCurrent, ignoreCurrent]);

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
          <span>F fix selected</span>
          <span>I exclude</span>
          <span>X exclude selected</span>
          <span>Space select</span>
        </div>
      </div>

      <div className="status-card status-card--review review-workbench__summary">
        <div>
          <strong>{summary.total}</strong>
          <div className="panel-muted">actionable items</div>
        </div>
        <div>
          <strong>{selectedCount}</strong>
          <div className="panel-muted">selected</div>
        </div>
        <div className="status-stack">
          <span className="status status--processing">{summary.lowConfidence} low confidence</span>
          <span className="status">{summary.pending} pending review</span>
          <span className="status">{summary.lowAccount} account mismatch</span>
          <span className="status">{summary.duplicateRisk} duplicate risk</span>
        </div>
      </div>

      <div className="review-workbench__grid">
        <article className="review-workbench__card review-workbench__card--main review-workbench__card--active">
          <div className="review-workbench__transaction-head">
            <div>
              <p className="review-workbench__active-tag">Active review item</p>
              <p className="review-workbench__title">{summarizeMerchantText(current.merchantClean ?? current.merchantRaw)}</p>
              {humanizeMerchantText(current.merchantRaw).toLowerCase() !==
              summarizeMerchantText(current.merchantClean ?? current.merchantRaw).toLowerCase() ? (
                <p className="review-workbench__subtitle">{humanizeMerchantText(current.merchantRaw)}</p>
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
              <strong>{formatTransactionDirectionLabel(current.type, current.amount)}</strong>
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
            <div className="review-workbench__confidence review-workbench__confidence--category">
              <div className="review-workbench__confidence-head">
                <span>{categorySignalLabel}</span>
                <strong>{current.categoryConfidence}%</strong>
              </div>
              <div className="review-workbench__meter" aria-hidden="true">
                <span style={{ width: `${Math.max(6, Math.min(current.categoryConfidence, 100))}%` }} />
              </div>
            </div>
            <div className="review-workbench__confidence review-workbench__confidence--account">
              <div className="review-workbench__confidence-head">
                <span>{accountSignalLabel}</span>
                <strong>{current.accountMatchConfidence}%</strong>
              </div>
              <div className="review-workbench__meter" aria-hidden="true">
                <span style={{ width: `${Math.max(6, Math.min(current.accountMatchConfidence, 100))}%` }} />
              </div>
            </div>
            <div className="review-workbench__confidence review-workbench__confidence--duplicate">
              <div className="review-workbench__confidence-head">
                <span>{duplicateSignalLabel}</span>
                <strong>{current.duplicateConfidence}%</strong>
              </div>
              <div className="review-workbench__meter" aria-hidden="true">
                <span style={{ width: `${Math.max(6, Math.min(current.duplicateConfidence, 100))}%` }} />
              </div>
            </div>
            <div className="review-workbench__confidence review-workbench__confidence--transfer">
              <div className="review-workbench__confidence-head">
                <span>{transferSignalLabel}</span>
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

          <div className="review-workbench__panel review-workbench__batch-panel">
            <div className="review-workbench__queue-head">
              <div>
                <p className="eyebrow">Batch triage</p>
                <h4>Queue selection</h4>
              </div>
              <div className="review-workbench__queue-tools">
                <button className="button button-secondary button-small" type="button" onClick={selectAllQueueItems} disabled={!items.length || isSaving}>
                  Select all
                </button>
                <button
                  className="button button-secondary button-small"
                  type="button"
                  onClick={clearSelection}
                  disabled={!selectedCount || isSaving}
                >
                  Clear
                </button>
              </div>
            </div>
            <p className="review-workbench__queue-copy">
              Select one or more rows, then accept, fix, or exclude them without opening each transaction.
            </p>
            <div className="review-workbench__queue-summary">
              <span>{selectedCount} selected</span>
              <span>{items.length} in queue</span>
            </div>
            <div className="review-workbench__queue-list" role="list" aria-label="Review queue items">
              {items.map((item) => {
                const itemSignals = getReviewSignals(item);
                const itemPrimaryReason = itemSignals[0] ?? null;
                const itemSummary = summarizeMerchantText(item.merchantClean ?? item.merchantRaw);
                const itemSubtext = humanizeMerchantText(item.merchantRaw);
                const itemIsSelected = selectedIds.includes(item.id);
                const itemIsActive = item.id === current?.id;

                return (
                  <div
                    key={item.id}
                    className={`review-workbench__queue-item ${itemIsSelected ? "is-selected" : ""} ${itemIsActive ? "is-active" : ""}`}
                    role="listitem"
                  >
                    <button
                      className="review-workbench__queue-check"
                      type="button"
                      onClick={() => toggleSelectedId(item.id)}
                      aria-label={`${itemIsSelected ? "Deselect" : "Select"} ${itemSummary}`}
                      aria-pressed={itemIsSelected}
                    >
                      {itemIsSelected ? "✓" : null}
                    </button>
                    <button
                      className="review-workbench__queue-main"
                      type="button"
                      onClick={() => {
                        setSelectedId(item.id);
                        setSelectedIds((currentSelectedIds) =>
                          currentSelectedIds.includes(item.id) ? currentSelectedIds : [...currentSelectedIds, item.id]
                        );
                      }}
                      aria-current={itemIsActive ? "true" : undefined}
                    >
                      <strong>{itemSummary}</strong>
                      <span>{itemSubtext.toLowerCase() !== itemSummary.toLowerCase() ? itemSubtext : item.description ?? "No extra note"}</span>
                      <small>
                        {formatDate(item.date)} · {item.accountName} · {item.categoryName ?? "Uncategorized"}
                      </small>
                    </button>
                    {itemPrimaryReason ? (
                      <span
                        className={`pill pill-subtle review-workbench__queue-reason review-workbench__reason--${itemPrimaryReason.tone}`}
                        title={itemPrimaryReason.detail}
                      >
                        {itemPrimaryReason.label}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className="review-workbench__batch-actions">
              <button
                className="button button-primary review-workbench__button-primary"
                type="button"
                onClick={() => void applyBatchAction("accept")}
                disabled={isSaving || selectedCount === 0}
              >
                Accept selected
              </button>
              <button
                className="button button-secondary review-workbench__button-secondary"
                type="button"
                onClick={() => void applyBatchAction("fix")}
                disabled={isSaving || !canBatchFix}
              >
                Fix selected
              </button>
              <button
                className="button button-secondary review-workbench__button-secondary"
                type="button"
                onClick={() => void applyBatchAction("exclude")}
                disabled={isSaving || selectedCount === 0}
              >
                Exclude selected
              </button>
            </div>
            <p className="review-workbench__batch-copy">
              Accept confirms trusted rows, fix writes the active edits back to every selected row, and exclude removes
              rows from totals. Every correction updates Clover&apos;s learning signals and merchant rules.
            </p>
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
              Exclude
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
