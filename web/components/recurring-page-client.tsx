"use client";

import { useEffect, useState } from "react";
import { CloverShell } from "@/components/clover-shell";
import { CommitmentsPanel } from "@/components/commitments-panel";
import { formatCurrencyAmount } from "@/lib/currency-format";
import { commitmentRecurrenceLabels } from "@/lib/commitments";

type RecurringPageClientProps = {
  workspaceId: string;
  commitments: Parameters<typeof CommitmentsPanel>[0]["commitments"];
  accounts: Parameters<typeof CommitmentsPanel>[0]["accounts"];
  transactions: Parameters<typeof CommitmentsPanel>[0]["transactions"];
  recurringPatterns: Array<{
    id: string;
    merchantRaw: string;
    merchantClean: string | null;
    amount: string | null;
    currency: string;
    frequency: string | null;
    firstSeenDate: string | null;
    lastSeenDate: string | null;
    nextExpectedDate: string | null;
    transactionCount: number;
    confidence: number;
    account: { id: string; name: string; institution: string | null } | null;
  }>;
  initialAddOpen?: boolean;
};

const addButtonIconStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
} as const;

const addButtonSvgStyle = {
  display: "block",
  width: 13,
  height: 13,
} as const;

export function RecurringPageClient({
  workspaceId,
  commitments,
  accounts,
  transactions,
  recurringPatterns,
  initialAddOpen = false,
}: RecurringPageClientProps) {
  const [addOpen, setAddOpen] = useState(initialAddOpen);

  useEffect(() => {
    document.body.toggleAttribute("data-clover-page-modal", addOpen);

    return () => {
      document.body.removeAttribute("data-clover-page-modal");
    };
  }, [addOpen]);

  useEffect(() => {
    if (!initialAddOpen) {
      return;
    }

    setAddOpen(true);
  }, [initialAddOpen]);

  useEffect(() => {
    const handleOpenAdd = () => {
      setAddOpen(true);
      window.history.replaceState({}, "", `${window.location.pathname}?add=1`);
    };

    window.addEventListener("clover:open-recurring-add", handleOpenAdd);
    return () => {
      window.removeEventListener("clover:open-recurring-add", handleOpenAdd);
    };
  }, []);

  const openAddModal = () => {
    setAddOpen(true);
    window.history.replaceState({}, "", `${window.location.pathname}?add=1`);
  };

  const closeAddModal = () => {
    setAddOpen(false);
    window.history.replaceState({}, "", window.location.pathname);
  };

  return (
    <CloverShell
      active="recurring"
      title="Recurring"
      actions={
        <button
          type="button"
          className="button button-primary button-small recurring-topbar-add transactions-action-button"
          onClick={openAddModal}
        >
          <span className="button-icon" aria-hidden="true" style={addButtonIconStyle}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={addButtonSvgStyle}>
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
          </span>
          <span>Add Recurring</span>
          <span className="button-icon" aria-hidden="true" style={addButtonIconStyle}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={addButtonSvgStyle}>
              <path d="M8 10l4 4 4-4" />
            </svg>
          </span>
        </button>
      }
    >
      <div className="recurring-page__stack">
        <section className="recurring-patterns glass">
          <div className="investments-allocation__head">
            <div className="investments-allocation__head-title">
              <p className="eyebrow">Imported patterns</p>
              <div className="investments-allocation__title-row">
                <h5>Recurring candidates</h5>
                <span className="panel-muted">From receipts, statements, and screenshots</span>
              </div>
            </div>
            <div className="investments-allocation__summary">
              <span>Patterns</span>
              <strong>{recurringPatterns.length}</strong>
            </div>
          </div>

          {recurringPatterns.length > 0 ? (
            <div className="recurring-patterns__list">
              {recurringPatterns.slice(0, 8).map((pattern) => {
                const label = pattern.merchantClean ?? pattern.merchantRaw;
                const amount = pattern.amount ? formatCurrencyAmount(Number(pattern.amount), pattern.currency) : "Amount not set";
                const recurrenceLabel = pattern.frequency && pattern.frequency in commitmentRecurrenceLabels ? commitmentRecurrenceLabels[pattern.frequency as keyof typeof commitmentRecurrenceLabels] : "Unspecified";

                return (
                  <article key={pattern.id} className="recurring-patterns__item">
                    <div className="recurring-patterns__item-head">
                      <strong>{label}</strong>
                      <span>{pattern.transactionCount} sighting{pattern.transactionCount === 1 ? "" : "s"}</span>
                    </div>
                    <div className="recurring-patterns__item-meta">
                      <span>{amount}</span>
                      <span>{recurrenceLabel}</span>
                      <span>{pattern.account ? pattern.account.name : "No account linked"}</span>
                    </div>
                    <div className="recurring-patterns__item-meta">
                      <span>First seen: {pattern.firstSeenDate ? new Date(pattern.firstSeenDate).toLocaleDateString("en-PH") : "Unknown"}</span>
                      <span>Next: {pattern.nextExpectedDate ? new Date(pattern.nextExpectedDate).toLocaleDateString("en-PH") : "Unknown"}</span>
                      <span>Confidence {pattern.confidence}%</span>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="investments-portfolio-table__empty">
              <strong>No recurring patterns yet.</strong>
              <p>Imported statements and screenshots will show probable repeats here once Clover sees enough history.</p>
            </div>
          )}
        </section>

        <CommitmentsPanel
          workspaceId={workspaceId}
          commitments={commitments}
          accounts={accounts}
          transactions={transactions}
          showAddModal={addOpen}
          onCloseAdd={closeAddModal}
        />
      </div>
    </CloverShell>
  );
}
