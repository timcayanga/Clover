import { type PricingMarket } from "./public-plan-comparison";

// Approved provider charges: Paddle bills Philippine customers in USD.
export const paddlePlusPricing = {
  ph: { currency: "USD", monthly: { amount: 2.69, label: "US$2.69" }, annual: { amount: 19.99, label: "US$19.99" } },
  global: { currency: "USD", monthly: { amount: 7.99, label: "US$7.99" }, annual: { amount: 59.99, label: "US$59.99" } },
} as const;

// Compatibility name for existing Plus callers.
export const paddleProPricing = paddlePlusPricing;
export const paddlePremiumPricing = {
  ph: { currency: "USD", monthly: { amount: 5.99, label: "US$5.99" }, annual: { amount: 49.99, label: "US$49.99" } },
  global: { currency: "USD", monthly: { amount: 12.99, label: "US$12.99" }, annual: { amount: 99.99, label: "US$99.99" } },
} as const;

type PaddlePrice = {
  status?: string;
  billing_cycle?: { interval?: string; frequency?: number } | null;
  trial_period?: unknown;
  unit_price?: { currency_code?: string; amount?: string };
  unit_price_overrides?: Array<{ country_codes?: string[]; unit_price?: { currency_code?: string; amount?: string } }>;
};

export const pricingMarketForCountry = (country: string | null | undefined): PricingMarket =>
  country?.toUpperCase() === "PH" ? "ph" : "global";

export function matchesPaddleApprovedPrice(price: PaddlePrice | null, country: string, interval: "monthly" | "annual", tier: "plus" | "pro" = "plus") {
  const expected = (tier === "pro" ? paddlePremiumPricing : paddlePlusPricing)[pricingMarketForCountry(country)];
  const unit = price?.unit_price_overrides?.find(override => override.country_codes?.includes(country.toUpperCase()))?.unit_price ?? price?.unit_price;
  return price?.status === "active" && !price.trial_period &&
    price.billing_cycle?.interval === (interval === "monthly" ? "month" : "year") &&
    price.billing_cycle.frequency === 1 && unit?.currency_code === expected.currency &&
    Number(unit.amount) === Math.round(expected[interval].amount * 100);
}

export type BillingOffers = {
  pro?: { paddle: { monthly: string | null; annual: string | null }; paddlePrices: { monthly: string; annual: string } };
  market: PricingMarket;
  prices: { monthly: string; annual: string };
  paddlePrices: { monthly: string; annual: string };
  paypal: { monthly: string | null; annual: string | null };
  paddle: { monthly: string | null; annual: string | null };
};
