"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatedTabs } from "@/components/animated-tabs";

type GoalsSection = "overview" | "progress" | "drivers" | "history";

type GoalsSubtabsProps = {
  activeSection: GoalsSection;
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

export function GoalsSubtabs({ activeSection, beginnerMode, children }: GoalsSubtabsProps) {
  return (
    <section className={`goals-story goals-story--section-${activeSection}${beginnerMode ? " goals-story--beginner" : ""} goals-story--panel`}>
      {children}
    </section>
  );
}

export function GoalsSubtabsTitleAddon({
  activeSection,
  availableSections,
}: {
  activeSection: GoalsSection;
  availableSections: GoalsSection[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    for (const section of availableSections) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("section", section);
      router.prefetch(`${pathname}?${params.toString()}`);
    }
  }, [availableSections, pathname, router, searchParams]);

  const setSection = (section: GoalsSection) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("section", section);
    router.replace(`${pathname}?${params.toString()}`);
  };

  return (
    <AnimatedTabs
      className="goals-tabs goals-tabs--inline"
      activeKey={activeSection}
      onChange={(key) => setSection(key as GoalsSection)}
      tabs={availableSections.map((section) => ({
        key: section,
        label: goalSectionLabels[section],
      }))}
    />
  );
}
