import { getEnv, type AppEnv } from "@/lib/env";

export type BillingInterval = "monthly" | "annual";

export type BillingPlanConfig = {
  interval: BillingInterval;
  label: string;
  cadence: string;
  priceLabel: string;
  priceValue: number;
  envKey: "PAYPAL_MONTHLY_PLAN_ID" | "PAYPAL_ANNUAL_PLAN_ID" | "PAYPAL_PRO_PLAN_ID";
};

export type BillingPlanResolved = BillingPlanConfig & {
  planId: string | null;
};

export const BILLING_PLANS: BillingPlanConfig[] = [
  {
    interval: "monthly",
    label: "Monthly",
    cadence: "Every month",
    priceLabel: "PHP 149",
    priceValue: 149,
    envKey: "PAYPAL_MONTHLY_PLAN_ID",
  },
  {
    interval: "annual",
    label: "Annual",
    cadence: "Every year",
    priceLabel: "PHP 1,299",
    priceValue: 1299,
    envKey: "PAYPAL_ANNUAL_PLAN_ID",
  },
];

export const BILLING_COPY = {
  free: {
    label: "Free",
    headline: "Start free and upgrade when you need more room.",
    detail: "Free is the default Clover plan. It keeps the core workflow open while you stay within the smaller account, upload, and row limits.",
  },
  pro: {
    label: "Pro",
    headline: "Your Pro access is active.",
    detail: "PayPal manages the subscription, and Clover updates access automatically when billing events arrive.",
  },
} as const;

export const getPayPalPlanIdForInterval = (interval: BillingInterval, env: AppEnv = getEnv()) => {
  if (interval === "monthly") {
    return env.PAYPAL_MONTHLY_PLAN_ID ?? env.PAYPAL_PRO_PLAN_ID ?? null;
  }

  return env.PAYPAL_ANNUAL_PLAN_ID ?? null;
};

export const getResolvedBillingPlans = (env: AppEnv = getEnv()): BillingPlanResolved[] =>
  BILLING_PLANS.map((plan) => ({
    ...plan,
    planId: getPayPalPlanIdForInterval(plan.interval, env),
  }));

export const getBillingPlanByInterval = (interval: BillingInterval, env: AppEnv = getEnv()) =>
  getResolvedBillingPlans(env).find((plan) => plan.interval === interval) ?? null;

export const getBillingPlanById = (planId: string | null | undefined, env: AppEnv = getEnv()) => {
  if (!planId) {
    return null;
  }

  return getResolvedBillingPlans(env).find((plan) => plan.planId === planId) ?? null;
};

export const getBillingPlanLabel = (interval: BillingInterval) => (interval === "monthly" ? "Monthly" : "Annual");
