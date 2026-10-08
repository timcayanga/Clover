import { PLAN_CATALOG, type CloverPlanTier } from "./plan-catalog";
export type UpgradeResource = "accounts" | "linkedBanks" | "goals" | "budgets" | "circles";
export type UpgradeContext = UpgradeResource | "insights" | "trends" | "planner" | "markets" | "analysis";
export const upgradeDetails = {
  accounts: { title: "Make room for more accounts.", mascot: "accounts", label: "accounts" },
  linkedBanks: { title: "Connect more of your banks.", mascot: "banks", label: "connected accounts" },
  goals: { title: "Make room for your next goal.", mascot: "savings", label: "goals" },
  budgets: { title: "Plan for more with another budget.", mascot: "budget", label: "active budgets" },
  circles: { title: "Create another Circle.", mascot: "circles", label: "Circles you create" },
  insights: { title: "Unlock forecasts, money-flow insights, and clearer next steps.", mascot: "reports", label: "Advanced Reports" },
  trends: { title: "Explore detailed income, spending, and category comparisons.", mascot: "reports", label: "Advanced Reports" },
  planner: { title: "Explore growth scenarios and the impact of regular contributions.", mascot: "investments", label: "Growth Planner" },
  markets: { title: "Explore market context alongside your portfolio.", mascot: "investments", label: "Markets" },
  analysis: { title: "Explore portfolio allocation and performance.", mascot: "investments", label: "Portfolio Analysis" },
} as const;
export function contextualUpgradeOptions(context: UpgradeContext, tier: CloverPlanTier | "unknown", currentLimit?: number | null) {
  const targets = tier === "free" ? ["pro", "premium"] as const : tier === "pro" ? ["premium"] as const : [];
  return targets.flatMap(target => {
    const resource = context in PLAN_CATALOG[target] ? context as UpgradeResource : null;
    const limit = resource ? PLAN_CATALOG[target][resource] : null;
    if (resource && currentLimit !== undefined && (currentLimit === null || limit! <= currentLimit)) return [];
    return [{ tier: target, name: PLAN_CATALOG[target].name, benefit: resource ? `${limit} ${upgradeDetails[context].label}` : upgradeDetails[context].label }];
  });
}
