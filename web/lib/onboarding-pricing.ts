import { regionalProPricing, type PricingMarket } from "@/lib/public-plan-comparison";

export function matchesOnboardingPrice(plan: any, market: PricingMarket, interval: "monthly" | "annual") {
  const cycles = plan?.billing_cycles;
  if (plan?.status !== "ACTIVE" || !Array.isArray(cycles) || cycles.length !== 1) return false;
  const cycle = cycles[0];
  const pricing = regionalProPricing[market];
  const expected = { currency: pricing.currency, amount: pricing[interval].amount };
  return cycle.tenure_type === "REGULAR" && cycle.total_cycles === 0 &&
    cycle.frequency?.interval_unit === (interval === "monthly" ? "MONTH" : "YEAR") &&
    cycle.frequency?.interval_count === 1 &&
    cycle.pricing_scheme?.fixed_price?.currency_code === expected.currency &&
    Number(cycle.pricing_scheme?.fixed_price?.value) === expected.amount &&
    Number(plan.payment_preferences?.setup_fee?.value ?? 0) === 0;
}
