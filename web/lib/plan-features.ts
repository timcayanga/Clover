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
    copy: "Free is the default Clover plan, with unlimited room for the current core workflow while access is being expanded.",
    bullets: [
      "Manual transaction tracking",
      "No account, upload, or transaction row caps for now",
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
      "No account, upload, or transaction row caps for now",
      "Unlimited transaction rows",
      "Full investment portfolio tools",
      "Advanced reports and Adviser guidance",
      "Enhanced goal tracking and recommendations",
    ],
  },
};

export const getPlanFeatureCopy = (planTier: PlanTier | "unknown") => (planTier === "unknown" ? null : PLAN_FEATURES[planTier]);
