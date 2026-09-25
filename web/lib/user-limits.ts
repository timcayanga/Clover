import type { PlanTier } from "@prisma/client";
import { BETA_FULL_ACCESS_ENABLED } from "@/lib/beta-access";

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
  premium: 20,
};

const PLAN_DEFAULT_LIMITS: Record<PlanTier, UserLimits> = {
  premium: { accountLimit: 40, monthlyUploadLimit: null, transactionLimit: null },
  free: {
    accountLimit: 10,
    monthlyUploadLimit: null,
    transactionLimit: null,
  },
  pro: {
    accountLimit: 20,
    monthlyUploadLimit: null,
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

// Dedicated disposable speed-QA identity. Never applies to production or
// arbitrary previews; remove this entry when the staging speed suite is retired.
const isStagingQaDeployment = () =>
  process.env.VERCEL_ENV === "preview" &&
  process.env.CLOVER_DEPLOYMENT_ENVIRONMENT === "staging" &&
  process.env.VERCEL_GIT_COMMIT_REF === "staging";

export const hasStagingQaAccess = (user: { clerkUserId?: string | null }) =>
  isStagingQaDeployment() &&
  user.clerkUserId === "user_3JJ1IGtRLHyU8hwh7AIRM8xAh8z";

// Owner-authorized Pro access for staging UI verification. This grants no Admin
// role or unlimited usage, and never applies to production or other previews.
export const hasStagingProAccess = (user: { clerkUserId?: string | null; email?: string | null }, now = Date.now()) =>
  hasStagingQaAccess(user) ||
  // Owner-authorized disposable native QA identity: standard Plus limits, no
  // Admin role or unlimited usage. Expires automatically after device audit.
  (isStagingQaDeployment() && user.clerkUserId === "user_3Jn5l6dedVoPWWZnTP74VJpspEf" && now < Date.parse("2026-09-28T00:00:00Z")) ||
  (isStagingQaDeployment() && user.email?.trim().toLowerCase() === "timcayanga@gmail.com");

export const hasUnlimitedPlanLimits = (user: { clerkUserId?: string | null }) =>
  Boolean(user.clerkUserId && UNLIMITED_SYNTHETIC_USER_IDS.has(user.clerkUserId)) || hasStagingQaAccess(user);

// Keep this rollout switch centralized so temporary unlimited access can be
// restored to the plan defaults without changing every feature gate.
export const PLAN_LIMITS_TEMPORARILY_DISABLED = BETA_FULL_ACCESS_ENABLED;

export const getPlanDefaultLimits = (planTier: PlanTier): UserLimits => PLAN_DEFAULT_LIMITS[planTier];

export const getPlanProfileLimit = (planTier: PlanTier): number => PLAN_PROFILE_LIMITS[planTier];

export const getEffectiveProfileLimit = (user: ProfileLimitSource): number | null => {
  if (PLAN_LIMITS_TEMPORARILY_DISABLED) {
    return null;
  }

  if (hasUnlimitedPlanLimits(user)) {
    return null;
  }

  if (process.env.NODE_ENV !== "production") {
    return null;
  }

  return getPlanProfileLimit(user.planTier);
};

export const getEffectiveUserLimits = (user: UserLimitsLike, options: EffectiveUserLimitsOptions = {}): UserLimits => {
  if (PLAN_LIMITS_TEMPORARILY_DISABLED) {
    return {
      accountLimit: null,
      monthlyUploadLimit: null,
      transactionLimit: null,
    };
  }

  if (hasUnlimitedPlanLimits(user)) {
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

  return {
    accountLimit: user.accountLimit ?? defaults.accountLimit,
    // Uploads and retained rows are governed by the shared Clover-token
    // allowance, including for accounts that still carry legacy overrides.
    monthlyUploadLimit: defaults.monthlyUploadLimit,
    transactionLimit: defaults.transactionLimit,
  };
};

export const formatLimitValue = (value: number | null) => (value === null ? "Unlimited" : value.toLocaleString());

export const getPlanDisplayLabel = (planTier: PlanTier, interval?: "monthly" | "annual" | null) => {
  if (planTier === "free") {
    return "Free";
  }

  if (interval === "monthly") {
    return planTier === "premium" ? "Pro Monthly" : "Plus Monthly";
  }

  if (interval === "annual") {
    return planTier === "premium" ? "Pro Annual" : "Plus Annual";
  }

  return planTier === "premium" ? "Pro" : "Plus";
};
