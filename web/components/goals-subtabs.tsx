import { type ReactNode } from "react";

type GoalsSection = "overview" | "progress" | "drivers" | "history";

type GoalsSubtabsProps = {
  activeSection: GoalsSection;
  beginnerMode: boolean;
  children: ReactNode;
};

export function GoalsSubtabs({ activeSection, beginnerMode, children }: GoalsSubtabsProps) {
  return (
    <section
      id={`goals-panel-${activeSection}`}
      role="tabpanel"
      aria-labelledby={`goals-tab-${activeSection}`}
      className={`goals-story goals-story--section-${activeSection}${beginnerMode ? " goals-story--beginner" : ""}`}
    >
      {children}
    </section>
  );
}
