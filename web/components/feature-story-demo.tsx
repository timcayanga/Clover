"use client";

import { memo } from "react";
import { LandingTransactionPhone } from "@/app/landing-preview/landing-journey";
import type { FeatureVisual } from "@/lib/feature-stories";

// Only verified, fictional-data app captures belong in public product imagery.
// Do not substitute hand-built marketing cards for pages that have not been captured.
export const FEATURE_CAPTURE_VISUALS: readonly FeatureVisual[] = ["transactions", "accounts", "recurring", "reports", "adviser", "investments", "budget", "goal", "circles", "split"];
export const FeatureStoryDemo = memo(function FeatureStoryDemo({ visual, market }: { visual: FeatureVisual; market: "ph" | "global" }) {
  if (!FEATURE_CAPTURE_VISUALS.includes(visual)) return null;
  return <LandingTransactionPhone market={market} screen={visual} style={{position:"relative",right:"auto",bottom:"auto",width:"100%"}} />;
});
