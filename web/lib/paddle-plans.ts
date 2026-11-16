import type { AppEnv } from "./env";

export type PaddleTier = "plus" | "pro";
export type PaddlePlan = {
  tier: PaddleTier;
  planTier: "pro" | "premium";
  interval: "monthly" | "annual";
  priceId: string;
  productId?: string;
};

// Stored `pro` means Plus; stored `premium` means the current Pro plan.
// Never mix legacy generic IDs with an explicitly configured two-tier catalog.
export function getPaddlePlans(env: AppEnv): PaddlePlan[] {
  const explicit = Boolean(env.PADDLE_PLUS_MONTHLY_PRICE_ID || env.PADDLE_PLUS_ANNUAL_PRICE_ID || env.PADDLE_PRO_MONTHLY_PRICE_ID || env.PADDLE_PRO_ANNUAL_PRICE_ID);
  const plans: PaddlePlan[] = [];
  for (const tier of ["plus", "pro"] as const) {
    for (const interval of ["monthly", "annual"] as const) {
      const priceId = tier === "plus"
        ? (interval === "monthly" ? env.PADDLE_PLUS_MONTHLY_PRICE_ID : env.PADDLE_PLUS_ANNUAL_PRICE_ID)
          ?? (!explicit ? (interval === "monthly" ? env.PADDLE_MONTHLY_PRICE_ID : env.PADDLE_ANNUAL_PRICE_ID) : undefined)
        : interval === "monthly" ? env.PADDLE_PRO_MONTHLY_PRICE_ID : env.PADDLE_PRO_ANNUAL_PRICE_ID;
      if (priceId) plans.push({ tier, planTier: tier === "plus" ? "pro" : "premium", interval, priceId,
        productId: tier === "plus" ? (explicit ? env.PADDLE_PLUS_PRODUCT_ID : env.PADDLE_PRODUCT_ID) : env.PADDLE_PRO_PRODUCT_ID });
    }
  }
  // Ambiguous IDs must not activate checkout or grant the wrong entitlement.
  return plans.filter(plan => plans.filter(other => other.priceId === plan.priceId).length === 1);
}

export function getPaddlePlanById(priceId: string | null | undefined, env: AppEnv) {
  return getPaddlePlans(env).find(plan => plan.priceId === priceId) ?? null;
}
