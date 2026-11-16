"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import type { CloverPlanTier } from "../../shared/plan-catalog";
import { planEntryPoint, planFunnelProperties } from "../../shared/plan-funnel";
import { capturePostHogClientEvent } from "@/components/posthog-analytics";

export function PublicPlanView({ currency }: { currency: string }) {
  const captured = useRef(false);
  useEffect(() => {
    if (captured.current) return;
    captured.current = true;
    capturePostHogClientEvent("plan_viewed", {
      ...planFunnelProperties(planEntryPoint(new URLSearchParams(window.location.search).get("plan_source")), undefined, currency), plan_surface: "public_pricing",
    });
  }, [currency]);
  return null;
}

export function PublicPlanLink({ tier, currency, href, children }: { tier: CloverPlanTier; currency: string; href: string; children: ReactNode }) {
  return <Link href={href} className={`button ${tier === "free" ? "button-secondary" : "button-primary"} button-pill`} onClick={() => {
    capturePostHogClientEvent("plan_selected", {
      ...planFunnelProperties(planEntryPoint(new URLSearchParams(window.location.search).get("plan_source")), undefined, currency, tier),
      plan_surface: "public_pricing", selection_stage: "plan",
    });
  }}>{children}</Link>;
}
