"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CloverShell } from "@/components/clover-shell";
import { CommitmentsPanel } from "@/components/commitments-panel";

type RecurringPageClientProps = {
  workspaceId: string;
  commitments: Parameters<typeof CommitmentsPanel>[0]["commitments"];
  recurringPatterns: Parameters<typeof CommitmentsPanel>[0]["recurringPatterns"];
  plannedPaymentSuggestions: Parameters<typeof CommitmentsPanel>[0]["plannedPaymentSuggestions"];
  accounts: Parameters<typeof CommitmentsPanel>[0]["accounts"];
  transactions: Parameters<typeof CommitmentsPanel>[0]["transactions"];
  initialTab?: RecurringTab;
  initialAddOpen?: boolean;
};

export type RecurringTab = "overview" | "planned" | "debt" | "owed" | "installments";

const recurringTabs: Array<{ id: RecurringTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "planned", label: "Planned Payments" },
  { id: "debt", label: "Debt & Loans" },
  { id: "owed", label: "Money Owed" },
  { id: "installments", label: "Installments" },
];

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
  initialTab = "overview",
  initialAddOpen = false,
}: RecurringPageClientProps) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(initialAddOpen);
  const [activeTab, setActiveTab] = useState<RecurringTab>(initialTab);

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
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    };

    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [router]);

  useEffect(() => {
    const handleOpenAdd = () => {
      setAddOpen(true);
      const query = new URLSearchParams(window.location.search);
      query.set("add", "1");
      window.history.replaceState({}, "", `${window.location.pathname}?${query.toString()}`);
    };

    window.addEventListener("clover:open-recurring-add", handleOpenAdd);
    return () => {
      window.removeEventListener("clover:open-recurring-add", handleOpenAdd);
    };
  }, []);

  const openAddModal = () => {
    setAddOpen(true);
    const query = new URLSearchParams(window.location.search);
    query.set("add", "1");
    window.history.replaceState({}, "", `${window.location.pathname}?${query.toString()}`);
  };

  const closeAddModal = () => {
    setAddOpen(false);
    const query = new URLSearchParams(window.location.search);
    query.delete("add");
    const suffix = query.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${suffix ? `?${suffix}` : ""}`);
  };

  const selectTab = (tab: RecurringTab) => {
    setActiveTab(tab);
    const query = new URLSearchParams(window.location.search);
    query.set("tab", tab);
    query.delete("add");
    window.history.replaceState({}, "", `${window.location.pathname}?${query.toString()}`);
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
        <nav className="recurring-tabs" aria-label="Recurring sections">
          {recurringTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`recurring-tabs__button${activeTab === tab.id ? " is-active" : ""}`}
              aria-current={activeTab === tab.id ? "page" : undefined}
              onClick={() => selectTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <CommitmentsPanel
          workspaceId={workspaceId}
          commitments={commitments}
          recurringPatterns={recurringPatterns}
          plannedPaymentSuggestions={plannedPaymentSuggestions}
          accounts={accounts}
          transactions={transactions}
          activeTab={activeTab}
          showAddModal={addOpen}
          onCloseAdd={closeAddModal}
        />
      </div>
    </CloverShell>
  );
}
