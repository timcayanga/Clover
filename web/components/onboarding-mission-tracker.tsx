"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const STORAGE_PREFIX = "clover.onboarding-mission-visit.v1";

export function OnboardingMissionTracker() {
  const pathname = usePathname();

  useEffect(() => {
    const action = pathname === "/accounts" || pathname === "/transactions"
      ? "check_data"
      : pathname === "/adviser" || pathname === "/reports"
        ? "open_insights"
        : null;
    if (!action) return;
    const key = `${STORAGE_PREFIX}:${action}`;
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "1");
    void fetch("/api/onboarding/missions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
      keepalive: true,
    }).catch(() => window.sessionStorage.removeItem(key));
  }, [pathname]);

  return null;
}
