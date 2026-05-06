"use client";

import { useMemo, useState, type ReactNode } from "react";
import { AnimatedTabs } from "@/components/animated-tabs";

type InsightsTab = "summary" | "spending" | "patterns";

type InsightsTabsProps = {
  initialTab: InsightsTab;
  summary: ReactNode;
  spending: ReactNode;
  patterns: ReactNode;
};

const insightsTabLabels: Record<InsightsTab, string> = {
  summary: "Summary",
  spending: "Spending",
  patterns: "Habits",
};

export function InsightsTabs({ initialTab, summary, spending, patterns }: InsightsTabsProps) {
  const [activeTab, setActiveTab] = useState<InsightsTab>(initialTab);
  const panels = useMemo(
    () => ({
      summary,
      spending,
      patterns,
    }),
    [summary, spending, patterns]
  );

  return (
    <section className="insights-tabs-shell">
      <AnimatedTabs
        className="insights-tabs insights-tabs--inline"
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as InsightsTab)}
        tabs={(Object.keys(insightsTabLabels) as InsightsTab[]).map((tab) => ({
          key: tab,
          label: insightsTabLabels[tab],
        }))}
      />
      <div key={activeTab} className="insights-tab-panel animate-tab-panel">
        {panels[activeTab]}
      </div>
    </section>
  );
}
