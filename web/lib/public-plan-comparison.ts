export type PricingMarket = "ph" | "global";
export const regionalProPricing = {
  ph: { currency: "PHP", monthly: { label: "₱169", amount: 169 }, annual: { label: "₱1,259", amount: 1259 } },
  global: { currency: "USD", monthly: { label: "US$7.99", amount: 7.99 }, annual: { label: "US$59.99", amount: 59.99 } },
} as const;
export const regionalPremiumPricing = {
  ph: { currency: "PHP", monthly: { label: "₱349", amount: 349 }, annual: { label: "₱2,999", amount: 2999 } },
  global: { currency: "USD", monthly: { label: "US$12.99", amount: 12.99 }, annual: { label: "US$99.99", amount: 99.99 } },
} as const;
export const plannedPremiumPrices = (market: PricingMarket) => ({monthly: regionalPremiumPricing[market].monthly.label, annual: regionalPremiumPricing[market].annual.label});
// Legacy helper name is retained for existing Plus checkout integrations.
export const plannedProPrices = (market: PricingMarket) => ({
  monthly: regionalProPricing[market].monthly.label,
  annual: regionalProPricing[market].annual.label,
});

export const PLAN_COMPARISON_ROWS = {
 uploads: ["Statement and receipt uploads", "Upload and review extracted transactions", "Everything in Free", "Everything in Plus"],
 adviser: ["Clover Adviser", "Answers from your Clover records", "External information and interactive visuals", "Plus features with a larger AI allowance"],
 reports: ["Reports", "Essential summaries", "Advanced reporting", "Advanced reporting"],
 investments: ["Investment tracking", "Basic tracking", "Full portfolio tools", "Full portfolio tools"],
 insights: ["Reports & investments", "Essential reports and basic tracking", "Advanced reports and portfolio tools", "Advanced reports and portfolio tools"],
 accounts: ["Non-cash financial accounts", "10", "20", "40"],
 linkedBanks: ["Linked bank accounts", "0", "2", "5"],
 profiles: ["Profiles", "3", "10", "20"],
 planning: ["Active budgets & goals", "2 budgets · 2 goals", "5 budgets · 5 goals", "10 budgets · 10 goals"],
 budgets: ["Active budgets", "2", "5", "10"],
 goals: ["Active goals", "2", "5", "10"],
 circles: ["Circles you create", "1", "5", "10"],
 ai: ["Monthly AI tokens · cloud + on-device", "100,000", "1 million", "4 million"],
 daily: ["AI tokens per rolling 24 hours", "30,000", "250,000", "1 million"],
} as const;
export const PLAN_COMPARISON_KEYS = {
 landing: ["adviser", "reports", "accounts", "linkedBanks", "ai"],
 feature: ["adviser", "insights", "accounts", "linkedBanks", "profiles", "planning", "ai"],
 full: ["uploads", "adviser", "reports", "investments", "accounts", "linkedBanks", "profiles", "budgets", "goals", "circles", "ai", "daily"],
} as const;
