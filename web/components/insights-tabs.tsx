"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { AnimatedTabs } from "@/components/animated-tabs";

type InsightsTab = "summary" | "spending" | "patterns";

type InsightsTabsContextValue = {
  activeTab: InsightsTab;
  setActiveTab: (tab: InsightsTab) => void;
};

const InsightsTabsContext = createContext<InsightsTabsContextValue | null>(null);

type InsightsTabsProps = {
  summary: ReactNode;
  spending: ReactNode;
  patterns: ReactNode;
};

const insightsTabLabels: Record<InsightsTab, string> = {
  summary: "Summary",
  spending: "Spending",
  patterns: "Habits",
};

export function InsightsTabsProvider({
  initialTab,
  children,
}: {
  initialTab: InsightsTab;
  children: ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<InsightsTab>(initialTab);

  return <InsightsTabsContext.Provider value={{ activeTab, setActiveTab }}>{children}</InsightsTabsContext.Provider>;
}

function useInsightsTabs() {
  const context = useContext(InsightsTabsContext);
  if (!context) {
    throw new Error("InsightsTabs must be used within an InsightsTabsProvider");
  }

  return context;
}

export function InsightsTabs({ summary, spending, patterns }: InsightsTabsProps) {
  const { activeTab } = useInsightsTabs();

  return (
    <section className="insights-tabs-shell insights-tabs-shell--panel">
      <div key={activeTab} className="insights-tab-panel animate-tab-panel">
        {activeTab === "summary" ? summary : activeTab === "spending" ? spending : patterns}
      </div>
    </section>
  );
}

export function InsightsTabsTitleAddon() {
  const { activeTab, setActiveTab } = useInsightsTabs();

  return (
    <AnimatedTabs
      className="insights-tabs insights-tabs--inline"
      activeKey={activeTab}
      onChange={(key) => setActiveTab(key as InsightsTab)}
      tabs={(Object.keys(insightsTabLabels) as InsightsTab[]).map((tab) => ({
        key: tab,
        label: insightsTabLabels[tab],
      }))}
    />
  );
}
