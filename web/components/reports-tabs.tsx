"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { AnimatedTabs } from "@/components/animated-tabs";

type ReportsSection = "overview" | "spending" | "trends" | "advanced";

type ReportsTabsContextValue = {
  activeSection: ReportsSection;
  setActiveSection: (section: ReportsSection) => void;
  availableSections: ReportsSection[];
};

const reportsSectionLabels: Record<ReportsSection, string> = {
  overview: "Summary",
  spending: "Spend",
  trends: "Patterns",
  advanced: "More",
};

const ReportsTabsContext = createContext<ReportsTabsContextValue | null>(null);

export function ReportsTabsProvider({
  initialSection,
  availableSections,
  children,
}: {
  initialSection: ReportsSection;
  availableSections: ReportsSection[];
  children: ReactNode;
}) {
  const [activeSection, setActiveSection] = useState<ReportsSection>(initialSection);

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
