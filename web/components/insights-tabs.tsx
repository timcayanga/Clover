"use client";

import { useMemo, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatedTabs } from "@/components/animated-tabs";

type InsightsTab = "summary" | "spending" | "patterns";

type InsightsTabsProps = {
  activeTab: InsightsTab;
  summary: ReactNode;
  spending: ReactNode;
  patterns: ReactNode;
};

const insightsTabLabels: Record<InsightsTab, string> = {
  summary: "Summary",
  spending: "Spending",
  patterns: "Habits",
};

export function InsightsTabs({ activeTab, summary, spending, patterns }: InsightsTabsProps) {
  const panels = useMemo(
    () => ({
      summary,
      spending,
      patterns,
    }),
    [summary, spending, patterns]
  );

  return (
    <section className="insights-tabs-shell insights-tabs-shell--panel">
      <div key={activeTab} className="insights-tab-panel animate-tab-panel">
        {panels[activeTab]}
      </div>
    </section>
  );
}

export function InsightsTabsTitleAddon({ activeTab }: { activeTab: InsightsTab }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setTab = (tab: InsightsTab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <AnimatedTabs
      className="insights-tabs insights-tabs--inline"
      activeKey={activeTab}
      onChange={(key) => setTab(key as InsightsTab)}
      tabs={(Object.keys(insightsTabLabels) as InsightsTab[]).map((tab) => ({
        key: tab,
        label: insightsTabLabels[tab],
      }))}
    />
  );
}
