import { regionalProPricing, type PricingMarket } from "./public-plan-comparison";

type PaddlePrice = {
  status?: string;
  billing_cycle?: { interval?: string; frequency?: number } | null;
  trial_period?: unknown;
  unit_price?: { currency_code?: string; amount?: string };
  unit_price_overrides?: Array<{ country_codes?: string[]; unit_price?: { currency_code?: string; amount?: string } }>;
};

export const pricingMarketForCountry = (country: string | null | undefined): PricingMarket =>
  country?.toUpperCase() === "PH" ? "ph" : "global";

export function matchesPaddleAdvertisedPrice(price: PaddlePrice | null, country: string, interval: "monthly" | "annual") {
  const expected = regionalProPricing[pricingMarketForCountry(country)];
  const unit = price?.unit_price_overrides?.find(override => override.country_codes?.includes(country.toUpperCase()))?.unit_price ?? price?.unit_price;
  return price?.status === "active" && !price.trial_period &&
    price.billing_cycle?.interval === (interval === "monthly" ? "month" : "year") &&
    price.billing_cycle.frequency === 1 && unit?.currency_code === expected.currency &&
    Number(unit.amount) === Math.round(expected[interval].amount * 100);
}

export type BillingOffers = {
  market: PricingMarket;
  prices: { monthly: string; annual: string };
  paypal: { monthly: string | null; annual: string | null };
  paddle: { monthly: string | null; annual: string | null };
};
