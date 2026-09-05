"use client";

import { memo } from "react";
import { LandingTransactionPhone } from "@/app/landing-preview/landing-journey";
import type { FeatureVisual } from "@/lib/feature-stories";

// Only verified, fictional-data app captures belong in public product imagery.
// Do not substitute hand-built marketing cards for pages that have not been captured.
export const FeatureStoryDemo = memo(function FeatureStoryDemo({ visual, market }: { visual: FeatureVisual; market: "ph" | "global" }) {
  if (visual !== "transactions") return null;
  return <LandingTransactionPhone market={market} style={{position:"relative",right:"auto",bottom:"auto",width:"100%"}} />;
});
