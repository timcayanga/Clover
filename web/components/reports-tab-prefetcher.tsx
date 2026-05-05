"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type ReportsRange = "30d" | "90d" | "ytd";
type ReportsSection = "overview" | "spending" | "trends" | "advanced";

const buildReportsHref = (
  range: ReportsRange,
  section: ReportsSection
) => `?${new URLSearchParams({ range, section }).toString()}`;

export function ReportsTabPrefetcher({
  currentRange,
  currentSection,
  isPro,
}: {
  currentRange: ReportsRange;
  currentSection: ReportsSection;
  isPro: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    const tabs: ReportsSection[] = isPro ? ["overview", "spending", "trends", "advanced"] : ["overview", "spending", "trends"];
    tabs.forEach((section) => {
      if (section !== currentSection) {
        router.prefetch(buildReportsHref(currentRange, section));
      }
    });
  }, [currentRange, currentSection, isPro, router]);

  return null;
}
