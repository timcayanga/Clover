"use client";

import { ReactNode, useState } from "react";

type InsightsTab = "summary" | "spending" | "patterns";

type InsightsTabsProps = {
  initialTab: InsightsTab;
  labels: Record<InsightsTab, string>;
  summary: ReactNode;
  spending: ReactNode;
  patterns: ReactNode;
};

export function InsightsTabs({ initialTab, labels, summary, spending, patterns }: InsightsTabsProps) {
  const [selectedTab, setSelectedTab] = useState<InsightsTab>(initialTab);

  const panels: Record<InsightsTab, ReactNode> = {
    summary,
    spending,
    patterns,
  };

  return (
    <>
      <nav className="insights-tabs" aria-label="Insights sections">
        {(Object.keys(labels) as InsightsTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`insights-tab ${selectedTab === tab ? "insights-tab--active" : ""}`}
            aria-pressed={selectedTab === tab}
            onClick={() => setSelectedTab(tab)}
          >
            {labels[tab]}
          </button>
        ))}
      </nav>

      {panels[selectedTab]}
    </>
  );
}
