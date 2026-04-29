"use client";

import { useEffect, useState, type ReactNode } from "react";

type GoalsSection = "overview" | "progress" | "drivers" | "history";

type GoalsSubtabsProps = {
  initialSection: GoalsSection;
  availableSections: GoalsSection[];
  beginnerMode: boolean;
  children: ReactNode;
};

const normalizeSection = (value: string | null | undefined): GoalsSection | null => {
  if (value === "overview" || value === "progress" || value === "drivers" || value === "history") {
    return value;
  }

  return null;
};

export function GoalsSubtabs({ initialSection, availableSections, beginnerMode, children }: GoalsSubtabsProps) {
  const firstAvailableSection = availableSections[0] ?? "overview";
  const [activeSection, setActiveSection] = useState<GoalsSection>(
    availableSections.includes(initialSection) ? initialSection : firstAvailableSection
  );

  useEffect(() => {
    setActiveSection(availableSections.includes(initialSection) ? initialSection : firstAvailableSection);
  }, [availableSections, firstAvailableSection, initialSection]);

  useEffect(() => {
    const syncFromLocation = () => {
      const params = new URLSearchParams(window.location.search);
      const nextSection = normalizeSection(params.get("section"));
      if (nextSection && availableSections.includes(nextSection)) {
        setActiveSection(nextSection);
        return;
      }

      if (!nextSection) {
        setActiveSection(firstAvailableSection);
      }
    };

    syncFromLocation();
    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, [availableSections, firstAvailableSection]);

  const selectSection = (section: GoalsSection) => {
    if (!availableSections.includes(section)) {
      return;
    }

    setActiveSection(section);
    const nextUrl = section === "overview" ? "/goals" : `/goals?section=${section}`;
    window.history.pushState({ section }, "", nextUrl);
  };

  return (
    <div className="goals-tabs-shell">
      <div className="goals-tabs-shell__head">
        <div>
          <p className="eyebrow">Goal views</p>
          <p className="goals-tabs-shell__lead">
            {beginnerMode ? "One goal at a time. Start here and move down the line when you want more detail." : "Choose the lens you want right now."}
          </p>
        </div>
        <p className="goals-tabs-shell__helper">
          Overview is the starting point. Progress shows the month. Drivers stay on Pro. History keeps the story.
        </p>
      </div>

      <nav className="reports-tabs goals-tabs goals-tabs--top" aria-label="Goal sections" role="tablist">
        {availableSections.map((section) => {
          const isActive = section === activeSection;
          const tabId = `goals-tab-${section}`;
          const panelId = `goals-panel-${section}`;

          return (
            <button
              key={section}
              id={tabId}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={panelId}
              className={`reports-tab${isActive ? " reports-tab--active" : ""}`}
              onClick={() => selectSection(section)}
            >
              {section === "overview" ? "Overview" : section === "progress" ? "Progress" : section === "drivers" ? "Drivers" : "History"}
            </button>
          );
        })}
      </nav>

      <section
        id={`goals-panel-${activeSection}`}
        role="tabpanel"
        aria-labelledby={`goals-tab-${activeSection}`}
        className={`goals-story goals-story--section-${activeSection}${beginnerMode ? " goals-story--beginner" : ""}`}
      >
        {children}
      </section>
    </div>
  );
}
