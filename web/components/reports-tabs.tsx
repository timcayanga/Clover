"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AnimatedTabs } from "@/components/animated-tabs";

type ReportsSection = "overview" | "spending" | "trends" | "advanced";

type ReportsTabsContextValue = {
  activeSection: ReportsSection;
  setActiveSection: (section: ReportsSection) => void;
  availableSections: ReportsSection[];
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
  children,
}: {
  initialSection: ReportsSection;
  availableSections: ReportsSection[];
  children: ReactNode;
}) {
  const [activeSection, setActiveSection] = useState<ReportsSection>(() => {
    if (typeof window === "undefined") {
      return initialSection;
    }

    return normalizeReportsSection(window.sessionStorage.getItem(reportsSectionStorageKey), availableSections, initialSection);
  });

  useEffect(() => {
    setActiveSection((current) => normalizeReportsSection(current, availableSections, initialSection));
  }, [availableSections, initialSection]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.sessionStorage.setItem(reportsSectionStorageKey, activeSection);
  }, [activeSection]);

  return (
    <ReportsTabsContext.Provider value={{ activeSection, setActiveSection, availableSections }}>
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
  const { activeSection, setActiveSection, availableSections } = useReportsTabs();

  return (
    <AnimatedTabs
      className="reports-top-tabs"
      activeKey={activeSection}
      onChange={(key) => setActiveSection(key as ReportsSection)}
      tabs={availableSections.map((section) => ({
        key: section,
        label: reportsSectionLabels[section],
        badge: section === "advanced" ? "Pro" : null,
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
