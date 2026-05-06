"use client";

import { useState, type ReactNode } from "react";
import { AnimatedTabs } from "@/components/animated-tabs";

type GoalsSection = "overview" | "progress" | "drivers" | "history";

type GoalsSubtabsProps = {
  initialSection: GoalsSection;
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

export function GoalsSubtabs({ initialSection, availableSections, beginnerMode, children }: GoalsSubtabsProps) {
  const [activeSection, setActiveSection] = useState<GoalsSection>(initialSection);

  return (
    <section className={`goals-story goals-story--section-${activeSection}${beginnerMode ? " goals-story--beginner" : ""}`}>
      <AnimatedTabs
        className="goals-tabs goals-tabs--inline"
        activeKey={activeSection}
        onChange={(key) => setActiveSection(key as GoalsSection)}
        tabs={availableSections.map((section) => ({
          key: section,
          label: goalSectionLabels[section],
        }))}
      />
      {children}
    </section>
  );
}
