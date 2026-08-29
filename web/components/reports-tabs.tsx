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

function ReportsTabIcon({ section }: { section: ReportsSection }) {
  if (section === "spending") {
    return <svg viewBox="0 0 24 24" fill="none"><path d="M5 19V9m7 10V5m7 14v-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
  }
  if (section === "trends") {
    return <svg viewBox="0 0 24 24" fill="none"><path d="m4 17 5-5 4 3 7-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  }
  if (section === "advanced") {
    return <svg viewBox="0 0 24 24" fill="none"><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
  }
  return <svg viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8" /><rect x="14" y="4" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8" /><rect x="4" y="14" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8" /><rect x="14" y="14" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8" /></svg>;
}

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
  const [activeSection, setActiveSection] = useState<ReportsSection>(initialSection);

  useEffect(() => {
    if (!restoreSelection) return;
    setActiveSection(
      normalizeReportsSection(
        window.sessionStorage.getItem(reportsSectionStorageKey),
        availableSections,
        initialSection
      )
    );
  }, [availableSections, initialSection, restoreSelection]);

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
      className="reports-top-tabs mobile-icon-tabs"
      activeKey={activeSection}
      onChange={(key) => setActiveSection(key as ReportsSection)}
      tabs={availableSections.map((section) => ({
        key: section,
        label: reportsSectionLabels[section],
        icon: <ReportsTabIcon section={section} />,
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
