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
type RecurringAddKind = "planned_payment" | "debt" | "receivable" | "reminder";

const recurringTabs: Array<{ id: RecurringTab; label: string; mobileLabel: string }> = [
  { id: "overview", label: "Overview", mobileLabel: "Overview" },
  { id: "planned", label: "Planned Payments", mobileLabel: "Planned" },
  { id: "debt", label: "Debt & Loans", mobileLabel: "Debts" },
  { id: "owed", label: "Money Owed", mobileLabel: "Owed" },
  { id: "installments", label: "Installments", mobileLabel: "Installments" },
];

const addKindForTab = (tab: RecurringTab): RecurringAddKind => {
  switch (tab) {
    case "debt":
      return "debt";
    case "owed":
      return "receivable";
    case "installments":
      return "reminder";
    default:
      return "planned_payment";
  }
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
  initialTab = "overview",
  initialAddOpen = false,
}: RecurringPageClientProps) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(initialAddOpen);
  const [activeTab, setActiveTab] = useState<RecurringTab>(initialTab);
  const [addKind, setAddKind] = useState<RecurringAddKind>(addKindForTab(initialTab));

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
    const handleOpenAdd = (event: Event) => {
      const detail = (event as CustomEvent<{ kind?: RecurringAddKind }>).detail;
      if (detail?.kind) {
        setAddKind(detail.kind);
      }
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
    setAddKind(addKindForTab(activeTab));
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
    window.history.replaceState({}, "", "/recurring");
  };

  return (
    <CloverShell
      active="recurring"
      title="Recurring"
      titleAddon={
        <nav className="investments-tabs recurring-tabs--top" aria-label="Recurring sections">
          {recurringTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`investments-tab${activeTab === tab.id ? " is-active" : ""}`}
              aria-current={activeTab === tab.id ? "page" : undefined}
              onClick={() => selectTab(tab.id)}
            >
              <span className="recurring-tab-label recurring-tab-label--desktop">{tab.label}</span>
              <span className="recurring-tab-label recurring-tab-label--mobile">{tab.mobileLabel}</span>
            </button>
          ))}
        </nav>
      }
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
        <CommitmentsPanel
          workspaceId={workspaceId}
          commitments={commitments}
          recurringPatterns={recurringPatterns}
          plannedPaymentSuggestions={plannedPaymentSuggestions}
          accounts={accounts}
          transactions={transactions}
          activeTab={activeTab}
          initialKind={addKind}
          showAddModal={addOpen}
          onCloseAdd={closeAddModal}
        />
      </div>
    </CloverShell>
  );
}
