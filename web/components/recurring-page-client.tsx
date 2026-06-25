"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CloverShell } from "@/components/clover-shell";
import { CommitmentsPanel } from "@/components/commitments-panel";
import { EmptyDataCta } from "@/components/empty-data-cta";

type RecurringPageClientProps = {
  workspaceId: string;
  commitments: Parameters<typeof CommitmentsPanel>[0]["commitments"];
  recurringPatterns: Parameters<typeof CommitmentsPanel>[0]["recurringPatterns"];
  plannedPaymentSuggestions: Parameters<typeof CommitmentsPanel>[0]["plannedPaymentSuggestions"];
  accounts: Parameters<typeof CommitmentsPanel>[0]["accounts"];
  transactions: Parameters<typeof CommitmentsPanel>[0]["transactions"];
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
  recurringPatterns,
  plannedPaymentSuggestions,
  accounts,
  transactions,
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

  const isGettingStartedState =
    commitments.length === 0 &&
    recurringPatterns.length === 0 &&
    plannedPaymentSuggestions.length === 0;

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
        {isGettingStartedState ? (
          <EmptyDataCta
            className="dashboard-empty-state"
            eyebrow="Recurring"
            title="Stay ahead of subscriptions, bills, loans, and reminders"
            copy="Use Recurring to keep upcoming payments from surprising you. Clover can help you track what is due next, what repeats every month, and what needs follow-up."
            highlights={[
              "Save subscriptions, bills, loans, and one-off reminders in one place.",
              "Catch upcoming due dates before they turn into last-minute stress.",
              "Anchor recurring items to accounts and transactions when you want extra context.",
            ]}
            illustration="/illustrations/clover-empty-dashboard-3d.png"
            illustrationAlt="A 3D Clover dashboard illustration"
            accountHref="/accounts"
            transactionHref="/transactions"
            actions={
              <>
                <button className="button button-primary button-small" type="button" onClick={openAddModal}>
                  Add recurring
                </button>
                <Link className="button button-secondary button-small" href="/transactions">
                  Review transactions
                </Link>
                <Link className="pill-link pill-link--inline transactions-empty-state__manual-link" href="/accounts">
                  Open accounts
                </Link>
              </>
            }
          />
        ) : null}
        <CommitmentsPanel
          workspaceId={workspaceId}
          commitments={commitments}
          recurringPatterns={recurringPatterns}
          plannedPaymentSuggestions={plannedPaymentSuggestions}
          accounts={accounts}
          transactions={transactions}
          showAddModal={addOpen}
          onCloseAdd={closeAddModal}
        />
      </div>
    </CloverShell>
  );
}
