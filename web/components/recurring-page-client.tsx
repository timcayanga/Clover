"use client";

import { useEffect, useState } from "react";
import { CloverShell } from "@/components/clover-shell";
import { CommitmentsPanel } from "@/components/commitments-panel";

type RecurringPageClientProps = {
  workspaceId: string;
  commitments: Parameters<typeof CommitmentsPanel>[0]["commitments"];
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
      <CommitmentsPanel
        workspaceId={workspaceId}
        commitments={commitments}
        accounts={accounts}
        transactions={transactions}
        showAddModal={addOpen}
        onCloseAdd={closeAddModal}
      />
    </CloverShell>
  );
}
