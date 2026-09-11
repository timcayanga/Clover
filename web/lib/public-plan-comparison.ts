export type PricingMarket = "ph" | "global";
export const regionalProPricing = {
  ph: { currency: "PHP", monthly: { label: "₱169", amount: 169 }, annual: { label: "₱1,699", amount: 1699 } },
  global: { currency: "USD", monthly: { label: "US$9.99", amount: 9.99 }, annual: { label: "US$99.99", amount: 99.99 } },
} as const;
export const plannedProPrices = (market: PricingMarket) => ({
  monthly: regionalProPricing[market].monthly.label,
  annual: regionalProPricing[market].annual.label,
});

export const PLAN_COMPARISON_ROWS = {
  uploads: ["Statement and receipt uploads", "Upload records and review extracted transactions", "Everything in Free"],
  adviser: ["Clover Adviser", "Answers from your Clover records", "Adds external information and interactive visuals"],
  reports: ["Reports", "Essential summaries", "Advanced reporting"],
  investments: ["Investment tracking", "Basic tracking", "Full portfolio tools"],
  insights: ["Reports & investments", "Essential reports and basic tracking", "Advanced reports and full portfolio tools"],
  accounts: ["Financial accounts", "5", "20"],
  profiles: ["Profiles", "1", "5"],
  planning: ["Active budgets & goals", "2 budgets · 2 goals", "5 budgets · 5 goals"],
  budgets: ["Active budgets", "2", "5"],
  goals: ["Active goals", "2", "5"],
  circles: ["Circles you create", "1", "5"],
  ai: ["Monthly AI allowance", "100,000 tokens", "1 million tokens"],
  daily: ["AI usage per rolling 24 hours", "Up to 30,000 tokens", "Up to 250,000 tokens"],
} as const;
export const PLAN_COMPARISON_KEYS = {
  landing: ["adviser", "reports", "accounts", "ai"],
  feature: ["adviser", "insights", "accounts", "profiles", "planning", "ai"],
  full: ["uploads", "adviser", "reports", "investments", "accounts", "profiles", "budgets", "goals", "circles", "ai", "daily"],
} as const;
