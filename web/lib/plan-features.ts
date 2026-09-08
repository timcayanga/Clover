import type { PlanTier } from "@prisma/client";

export type PlanLimits = {
  accountLimit: number;
  monthlyUploadLimit: number;
  transactionLimit: number | null;
};

export const PLAN_FEATURES: Record<PlanTier, { title: string; headline: string; copy: string; bullets: string[] }> = {
  free: {
    title: "Free",
    headline: "Clover keeps the core workflow open on Free.",
    copy: "Free includes the core Clover workflow with a monthly shared allowance for Adviser and AI-assisted parsing.",
    bullets: [
      "Manual transaction tracking",
      "3 profiles and 5 non-cash accounts",
      "100,000 Clover tokens monthly",
      "Unlimited files and transaction rows within the token allowance",
      "Basic investment tracking",
      "Basic reports and Adviser guidance",
      "Basic goal tracking",
    ],
  },
  pro: {
    title: "Pro",
    headline: "Pro gives you more room to work with the full picture.",
    copy: "Pro is designed for broader account coverage, heavier importing, and richer analysis across goals, reports, Adviser guidance, recommendations, and investing.",
    bullets: [
      "Manual transaction tracking",
      "10 profiles and 20 non-cash accounts",
      "1,000,000 Clover tokens monthly",
      "Unlimited files and transaction rows within the token allowance",
      "Full investment portfolio tools",
      "Advanced reports and Adviser guidance",
      "Enhanced goal tracking and recommendations",
    ],
  },
};

export const getPlanFeatureCopy = (planTier: PlanTier | "unknown") => (planTier === "unknown" ? null : PLAN_FEATURES[planTier]);
