"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AnimatedTabs } from "@/components/animated-tabs";
import { BETA_FULL_ACCESS_ENABLED } from "@/lib/beta-access";

type ReportsSection = "overview" | "spending" | "trends" | "advanced";

type ReportsTabsContextValue = {
  activeSection: ReportsSection;
  setActiveSection: (section: ReportsSection) => void;
  availableSections: ReportsSection[];
  lockedSections: ReportsSection[];
};

const reportsSectionLabels: Record<ReportsSection, string> = {
  overview: "Overview",
  spending: "Spending",
  trends: "Trends",
  advanced: "Insights",
};

const ReportsTabsContext = createContext<ReportsTabsContextValue | null>(null);
const reportsSectionStorageKey = "clover.adviser.active-section.v1";

const normalizeReportsSection = (value: string | null | undefined, availableSections: ReportsSection[], fallback: ReportsSection) => {
  if (value === "overview" || value === "spending" || value === "trends" || value === "advanced") {
    return availableSections.includes(value) ? value : fallback;
  }

  return fallback;
};

export function ReportsTabsProvider({
  initialSection,
  availableSections,
  lockedSections = [],
  restoreSelection = true,
  children,
}: {
  initialSection: ReportsSection;
  availableSections: ReportsSection[];
  lockedSections?: ReportsSection[];
  restoreSelection?: boolean;
  children: ReactNode;
}) {
  const [activeSection, setActiveSection] = useState<ReportsSection>(() => {
    if (typeof window === "undefined" || !restoreSelection) {
      return initialSection;
    }

    return normalizeReportsSection(window.sessionStorage.getItem(reportsSectionStorageKey), availableSections, initialSection);
  });

  useEffect(() => {
    setActiveSection((current) => normalizeReportsSection(current, availableSections, initialSection));
  }, [availableSections, initialSection]);

  useEffect(() => {
    if (typeof window === "undefined" || !restoreSelection) {
      return;
    }

    window.sessionStorage.setItem(reportsSectionStorageKey, activeSection);
  }, [activeSection, restoreSelection]);

  return (
    <ReportsTabsContext.Provider value={{ activeSection, setActiveSection, availableSections, lockedSections }}>
      {children}
    </ReportsTabsContext.Provider>
  );
}

function useReportsTabs() {
  const context = useContext(ReportsTabsContext);
  if (!context) {
    throw new Error("Reports tabs must be used within a ReportsTabsProvider");
  }

  return context;
}

export function ReportsTopTabs() {
  const { activeSection, setActiveSection, availableSections, lockedSections } = useReportsTabs();

  return (
    <AnimatedTabs
      className="reports-top-tabs"
      activeKey={activeSection}
      onChange={(key) => setActiveSection(key as ReportsSection)}
      tabs={availableSections.map((section) => ({
        key: section,
        label: reportsSectionLabels[section],
        badge: section === "advanced" && !BETA_FULL_ACCESS_ENABLED ? "Pro" : null,
        locked: lockedSections.includes(section),
      }))}
    />
  );
}

export function ReportsSection({ section, children }: { section: ReportsSection; children: ReactNode }) {
  const { activeSection } = useReportsTabs();

  if (activeSection !== section) {
    return null;
  }

  return <>{children}</>;
}
