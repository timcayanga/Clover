import type { PlanTier } from "@prisma/client";

export type UserLimits = {
  accountLimit: number;
  monthlyUploadLimit: number;
  transactionLimit: number | null;
};

const PLAN_DEFAULT_LIMITS: Record<PlanTier, UserLimits> = {
  free: {
    accountLimit: 5,
    monthlyUploadLimit: 10,
    transactionLimit: 1000,
  },
  pro: {
    accountLimit: 20,
    monthlyUploadLimit: 100,
    transactionLimit: null,
  },
};

type UserLimitsLike = {
  planTier: PlanTier;
  accountLimit: number | null;
  monthlyUploadLimit: number | null;
  transactionLimit: number | null;
};

export const getPlanDefaultLimits = (planTier: PlanTier): UserLimits => PLAN_DEFAULT_LIMITS[planTier];

export const getEffectiveUserLimits = (user: UserLimitsLike): UserLimits => {
  const defaults = getPlanDefaultLimits(user.planTier);

  return {
    accountLimit: user.accountLimit ?? defaults.accountLimit,
    monthlyUploadLimit: user.monthlyUploadLimit ?? defaults.monthlyUploadLimit,
    transactionLimit: user.transactionLimit ?? defaults.transactionLimit,
  };
};

export const formatLimitValue = (value: number | null) => (value === null ? "Unlimited" : value.toLocaleString());

export const getPlanDisplayLabel = (planTier: PlanTier, interval?: "monthly" | "annual" | null) => {
  if (planTier === "free") {
    return "Free";
  }

  if (interval === "monthly") {
    return "Pro Monthly";
  }

  if (interval === "annual") {
    return "Pro Annual";
  }

  return "Pro";
};
