"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { AnimatedTabs } from "@/components/animated-tabs";

type GoalsSection = "overview" | "progress" | "drivers" | "history";

type GoalsTabsContextValue = {
  activeSection: GoalsSection;
  setActiveSection: (section: GoalsSection) => void;
};

const GoalsTabsContext = createContext<GoalsTabsContextValue | null>(null);

type GoalsSubtabsProps = {
  availableSections: GoalsSection[];
  beginnerMode: boolean;
  children: ReactNode;
};

const goalSectionLabels: Record<GoalsSection, string> = {
  overview: "Overview",
  progress: "Progress",
  drivers: "Drivers",
  history: "History",
};

export function GoalsSubtabsProvider({
  initialSection,
  children,
}: {
  initialSection: GoalsSection;
  children: ReactNode;
}) {
  const [activeSection, setActiveSection] = useState<GoalsSection>(initialSection);

  return <GoalsTabsContext.Provider value={{ activeSection, setActiveSection }}>{children}</GoalsTabsContext.Provider>;
}

function useGoalsTabs() {
  const context = useContext(GoalsTabsContext);
  if (!context) {
    throw new Error("GoalsSubtabs must be used within a GoalsSubtabsProvider");
  }

  return context;
}

export function GoalsSubtabs({ beginnerMode, children }: GoalsSubtabsProps) {
  const { activeSection } = useGoalsTabs();

  return (
    <section className={`goals-story goals-story--section-${activeSection}${beginnerMode ? " goals-story--beginner" : ""} goals-story--panel`}>
      {children}
    </section>
  );
}

export function GoalsSubtabsTitleAddon({
  availableSections,
}: {
  availableSections: GoalsSection[];
}) {
  const { activeSection, setActiveSection } = useGoalsTabs();

  return (
    <AnimatedTabs
      className="goals-tabs goals-tabs--inline"
      activeKey={activeSection}
      onChange={(key) => setActiveSection(key as GoalsSection)}
      tabs={availableSections.map((section) => ({
        key: section,
        label: goalSectionLabels[section],
      }))}
    />
  );
}
