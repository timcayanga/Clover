import { PLAN_CATALOG, type CloverPlanTier } from "./plan-catalog";

export const RETAINED_RESOURCES = ["accounts", "profiles", "budgets", "goals", "circles"] as const;
export type RetainedResource = typeof RETAINED_RESOURCES[number];
export type RetainedUsage = Record<RetainedResource, number>;
export const RESOURCE_LABELS: Record<RetainedResource, string> = {
  accounts: "Non-cash accounts", profiles: "Profiles", budgets: "Active budgets", goals: "Goals", circles: "Circles you own",
};
export const RETENTION_MESSAGE = "Your existing records and history stay accessible. Nothing is deleted or automatically archived when you change plans. You can keep using existing items; creating more requires room within your plan's limit.";
export const DOWNGRADE_MESSAGE = "The new limits apply when your billing provider confirms the plan change takes effect. Bank connections and paid features follow the new plan. AI usage already consumed is not reset by changing plans.";
export function retainedPlanRows(usage: RetainedUsage, tier: CloverPlanTier, overrides: Partial<Record<RetainedResource, number | null>> = {}) {
  return RETAINED_RESOURCES.map(key => {
    const limit = overrides[key] === undefined ? PLAN_CATALOG[tier][key] : overrides[key]!;
    const used = usage[key];
    return { key, label: RESOURCE_LABELS[key], used, limit, excess: limit === null ? 0 : Math.max(0, used - limit), canCreate: limit === null || used < limit };
  });
}
export type RetentionSnapshot = {
  planTier: CloverPlanTier;
  usage: RetainedUsage;
  limits: Partial<Record<RetainedResource, number | null>>;
};
