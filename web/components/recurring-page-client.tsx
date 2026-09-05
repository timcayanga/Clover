"use client";
import { useMobileCreationRoute } from "@/lib/use-mobile-creation-route";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CloverShell } from "@/components/clover-shell";
import { CommitmentsPanel } from "@/components/commitments-panel";
import { ContextualAskClover } from "@/components/contextual-ask-clover";
import { MOBILE_LAYOUT_MEDIA_QUERY } from "@/lib/responsive-layout";

type RecurringPageClientProps = {
  workspaceId: string;
  commitments: Parameters<typeof CommitmentsPanel>[0]["commitments"];
  recurringPatterns: Parameters<typeof CommitmentsPanel>[0]["recurringPatterns"];
  plannedPaymentSuggestions: Parameters<typeof CommitmentsPanel>[0]["plannedPaymentSuggestions"];
  accounts: Parameters<typeof CommitmentsPanel>[0]["accounts"];
  categoryOptions: Parameters<typeof CommitmentsPanel>[0]["categoryOptions"];
  transactions: Parameters<typeof CommitmentsPanel>[0]["transactions"];
  planTier: "free" | "pro";
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

function RecurringTabIcon({ tab }: { tab: RecurringTab }) {
  if (tab === "planned") return <svg viewBox="0 0 24 24" fill="none"><path d="M6 4v3m12-3v3M5 9h14M6 6h12a2 2 0 0 1 2 2v11H4V8a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (tab === "debt") return <svg viewBox="0 0 24 24" fill="none"><path d="M4 8h16v11H4zM7 8V5h10v3m-9 5h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (tab === "owed") return <svg viewBox="0 0 24 24" fill="none"><path d="M4 12h16m-4-4 4 4-4 4M8 8l-4 4 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (tab === "installments") return <svg viewBox="0 0 24 24" fill="none"><path d="M6 6h12M6 12h12M6 18h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><circle cx="4" cy="6" r="1" fill="currentColor" /><circle cx="4" cy="12" r="1" fill="currentColor" /><circle cx="4" cy="18" r="1" fill="currentColor" /></svg>;
  return <svg viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8" /><rect x="14" y="4" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8" /><rect x="4" y="14" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8" /><rect x="14" y="14" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8" /></svg>;
}

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
  categoryOptions,
  transactions,
  planTier,
  initialTab = "overview",
  initialAddOpen = false,
}: RecurringPageClientProps) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(initialAddOpen);
  const mobileCreation = useMobileCreationRoute(addOpen, setAddOpen, "/recurring");
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
      if (window.matchMedia(MOBILE_LAYOUT_MEDIA_QUERY).matches) return;
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
    if (window.matchMedia(MOBILE_LAYOUT_MEDIA_QUERY).matches) return;
    const query = new URLSearchParams(window.location.search);
    query.set("add", "1");
    window.history.replaceState({}, "", `${window.location.pathname}?${query.toString()}`);
  };

  const closeAddModal = () => {
    setAddOpen(false);
    if (window.matchMedia(MOBILE_LAYOUT_MEDIA_QUERY).matches) return;
    const query = new URLSearchParams(window.location.search);
    query.delete("add");
    const suffix = query.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${suffix ? `?${suffix}` : ""}`);
  };

  const selectTab = (tab: RecurringTab) => {
    setActiveTab(tab);
    if (window.location.search || window.location.hash) {
      window.history.replaceState({}, "", "/recurring");
    }
  };

  const renderRecurringTabs = (mobile = false) => (
    <nav
      className={`investments-tabs recurring-tabs--top${mobile ? " recurring-tabs--mobile" : " mobile-icon-tabs"}`}
      aria-label="Recurring sections"
    >
      {recurringTabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`investments-tab${activeTab === tab.id ? " is-active" : ""}`}
          aria-label={tab.label}
          aria-current={activeTab === tab.id ? "page" : undefined}
          onClick={() => selectTab(tab.id)}
        >
          <span className="recurring-tab-icon" aria-hidden="true"><RecurringTabIcon tab={tab.id} /></span>
          <span className="recurring-tab-label recurring-tab-label--desktop">{tab.label}</span>
          <span className="recurring-tab-label recurring-tab-label--mobile">{tab.mobileLabel}</span>
        </button>
      ))}
    </nav>
  );

  return (
    <CloverShell
      active="recurring"
      title="Recurring"
      titleAddon={renderRecurringTabs()}
      mobileSubheader={renderRecurringTabs(true)}
      mobileLeadingAction={<ContextualAskClover context="recurring" planTier={planTier} />}
      actions={
        <div className="recurring-shell-actions">
          <ContextualAskClover context="recurring" planTier={planTier} />
          <button
            type="button"
            className="button button-primary button-small recurring-topbar-add transactions-action-button"
            aria-label="Add recurring"
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
        </div>
      }
    >
      <div className="recurring-page__stack">
        <CommitmentsPanel
          workspaceId={workspaceId}
          commitments={commitments}
          recurringPatterns={recurringPatterns}
          plannedPaymentSuggestions={plannedPaymentSuggestions}
          accounts={accounts}
          categoryOptions={categoryOptions}
          transactions={transactions}
          activeTab={activeTab}
          initialKind={addKind}
          showAddModal={addOpen}
          creationPage={mobileCreation}
          onCloseAdd={closeAddModal}
        />
      </div>
    </CloverShell>
  );
}
