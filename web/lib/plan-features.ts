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
    copy: "Free is best for getting organized, testing the product, and staying within a smaller set of limits.",
    bullets: [
      "Manual transaction tracking",
      "5 non-cash accounts",
      "10 monthly uploads",
      "1,000 transaction rows",
      "Basic investment tracking",
      "Basic reports and insights",
      "Basic goal tracking",
    ],
  },
  pro: {
    title: "Pro",
    headline: "Pro gives you more room to work with the full picture.",
    copy: "Pro is designed for broader account coverage, heavier importing, and richer analysis across goals, reports, insights, recommendations, and investing.",
    bullets: [
      "Manual transaction tracking",
      "20 non-cash accounts",
      "100 monthly uploads",
      "Unlimited transaction rows",
      "Full investment portfolio tools",
      "Advanced reports and insights",
      "Enhanced goal tracking and recommendations",
    ],
  },
};

export const getPlanFeatureCopy = (planTier: PlanTier | "unknown") => (planTier === "unknown" ? null : PLAN_FEATURES[planTier]);
