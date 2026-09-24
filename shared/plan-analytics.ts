import { PLAN_CATALOG, type CloverPlanTier } from "./plan-catalog";
export const publicPlan = (tier: unknown) => tier === "premium" ? "pro" : tier === "pro" ? "plus" : tier === "free" ? "free" : "unknown";
/** New events use public names. Historical events retain their original values. */
export function normalizePlanAnalytics<T extends Record<string, unknown>>(properties: T): T & Record<string, unknown> {
  if (properties.plan_schema_version === 3) return properties;
  const result: Record<string, unknown> = { ...properties, plan_schema_version: 3 };
  for (const key of ["plan_tier", "previous_plan", "target_plan"]) {
    if (key in properties) { result[`${key}_internal`] = properties[key]; result[key] = publicPlan(properties[key]); }
  }
  return result as T & Record<string, unknown>;
}
export function planContext(tier: CloverPlanTier, source: string, provider: string | null = null, paid = false) {
  return { plan_schema_version: 3, plan_tier: publicPlan(tier), plan_tier_internal: tier, plan_name: PLAN_CATALOG[tier].name,
    access_source: source, is_paid_subscriber: paid, billing_provider: provider ?? "none", is_complimentary: source.includes("complimentary"), is_manual_override: source === "manual override", is_test_access: source === "staging QA override" };
}
