/** Persisted `pro` is the legacy subscription, now marketed as Plus.
 * Never remap existing provider products to premium implicitly. */
export type CloverPlanTier = "free" | "pro" | "premium" | "premium";
export const PLAN_CATALOG = {
  free: { name: "Free", accounts: 10, profiles: 3, budgets: 2, goals: 2, circles: 1, linkedBanks: 0, monthlyTokens: 100_000, dailyTokens: 30_000 },
  pro: { name: "Plus", accounts: 20, profiles: 10, budgets: 5, goals: 5, circles: 5, linkedBanks: 2, monthlyTokens: 1_000_000, dailyTokens: 250_000 },
  premium: { name: "Pro", accounts: 40, profiles: 20, budgets: 10, goals: 10, circles: 10, linkedBanks: 5, monthlyTokens: 4_000_000, dailyTokens: 1_000_000 },
} as const;
export const planName = (tier: CloverPlanTier | "unknown") => tier === "unknown" ? "Unknown" : PLAN_CATALOG[tier].name;
export const isPaidPlan = (tier: string | undefined | null) => tier === "pro" || tier === "premium";
