import { getEnv, type AppEnv } from "./env";
import { fetchPayPalPlan } from "./paypal-billing";
import { matchesOnboardingPrice } from "./onboarding-pricing";
import { matchesPaddleAdvertisedPrice, pricingMarketForCountry, type BillingOffers } from "./billing-offer-rules";
import { plannedProPrices } from "./public-plan-comparison";

export async function getVerifiedBillingOffers(country: string, env: AppEnv = getEnv()): Promise<BillingOffers> {
  const market = pricingMarketForCountry(country);
  const verifyPayPal = async (id: string | undefined, interval: "monthly" | "annual") => {
    if (!id || !env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) return null;
    const plan = await fetchPayPalPlan(id, env).catch(() => null);
    return matchesOnboardingPrice(plan, market, interval) ? id : null;
  };
  const verifyPaddle = async (id: string | undefined, interval: "monthly" | "annual") => {
    if (!id || !env.PADDLE_API_KEY || !env.PADDLE_CLIENT_TOKEN || !env.PADDLE_WEBHOOK_SECRET) return null;
    try {
      const host = env.PADDLE_ENV === "live" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
      const response = await fetch(`${host}/prices/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${env.PADDLE_API_KEY}` },
        signal: AbortSignal.timeout(10_000), cache: "no-store",
      });
      const price = response.ok ? (await response.json()).data : null;
      return matchesPaddleAdvertisedPrice(price, country, interval) ? id : null;
    } catch { return null; }
  };
  const [paypalMonthly, paypalAnnual, paddleMonthly, paddleAnnual] = await Promise.all([
    verifyPayPal(env.PAYPAL_MONTHLY_PLAN_ID ?? env.PAYPAL_PRO_PLAN_ID, "monthly"),
    verifyPayPal(env.PAYPAL_ANNUAL_PLAN_ID, "annual"),
    verifyPaddle(env.PADDLE_MONTHLY_PRICE_ID, "monthly"),
    verifyPaddle(env.PADDLE_ANNUAL_PRICE_ID, "annual"),
  ]);
  return { market, prices: plannedProPrices(market), paypal: { monthly: paypalMonthly, annual: paypalAnnual }, paddle: { monthly: paddleMonthly, annual: paddleAnnual } };
}
