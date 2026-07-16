import type { PlanTier } from "@prisma/client";

export type UserLimits = {
  accountLimit: number | null;
  monthlyUploadLimit: number | null;
  transactionLimit: number | null;
};

export type ProfileLimitSource = {
  clerkUserId?: string | null;
  planTier: PlanTier;
};

const PLAN_PROFILE_LIMITS: Record<PlanTier, number> = {
  free: 3,
  pro: 10,
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
  clerkUserId?: string | null;
  planTier: PlanTier;
  accountLimit: number | null;
  monthlyUploadLimit: number | null;
  transactionLimit: number | null;
};

type EffectiveUserLimitsOptions = {
  ignoreDevelopmentOverride?: boolean;
};

const UNLIMITED_SYNTHETIC_USER_IDS = new Set(["staging-guest", "local-admin"]);

export const getPlanDefaultLimits = (planTier: PlanTier): UserLimits => PLAN_DEFAULT_LIMITS[planTier];

export const getPlanProfileLimit = (planTier: PlanTier): number => PLAN_PROFILE_LIMITS[planTier];

export const getEffectiveProfileLimit = (user: ProfileLimitSource): number | null => {
  if (user.clerkUserId && UNLIMITED_SYNTHETIC_USER_IDS.has(user.clerkUserId)) {
    return null;
  }

  if (process.env.NODE_ENV !== "production") {
    return null;
  }

  return getPlanProfileLimit(user.planTier);
};

export const getEffectiveUserLimits = (user: UserLimitsLike, options: EffectiveUserLimitsOptions = {}): UserLimits => {
  if (user.clerkUserId && UNLIMITED_SYNTHETIC_USER_IDS.has(user.clerkUserId)) {
    return {
      accountLimit: null,
      monthlyUploadLimit: null,
      transactionLimit: null,
    };
  }

  if (process.env.NODE_ENV !== "production" && !options.ignoreDevelopmentOverride) {
    return {
      accountLimit: null,
      monthlyUploadLimit: null,
      transactionLimit: null,
    };
  }

  const defaults = getPlanDefaultLimits(user.planTier);
  const defaultMonthlyUploadLimit = defaults.monthlyUploadLimit ?? 0;
  const monthlyUploadLimit =
    user.monthlyUploadLimit === null ? defaults.monthlyUploadLimit : Math.max(defaultMonthlyUploadLimit, user.monthlyUploadLimit);

  return {
    accountLimit: user.accountLimit ?? defaults.accountLimit,
    monthlyUploadLimit,
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
