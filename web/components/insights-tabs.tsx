import { ReactNode } from "react";

type InsightsTab = "summary" | "spending" | "patterns";

type InsightsTabsProps = {
  selectedTab: InsightsTab;
  summary: ReactNode;
  spending: ReactNode;
  patterns: ReactNode;
};

export function InsightsTabs({ selectedTab, summary, spending, patterns }: InsightsTabsProps) {
  const panels: Record<InsightsTab, ReactNode> = {
    summary,
    spending,
    patterns,
  };

  return panels[selectedTab];
}
