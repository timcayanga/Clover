import { getPaddlePlans, type PaddlePlan } from "./paddle-plans";
import { getDeploymentEnvironment } from "./deployment-environment";
import { getEnv, type AppEnv } from "./env";
import { fetchPayPalPlan } from "./paypal-billing";
import { matchesOnboardingPrice } from "./onboarding-pricing";
import { matchesPaddleApprovedPrice, pricingMarketForCountry, paddleProPricing, paddlePremiumPricing, type BillingOffers } from "./billing-offer-rules";
import { plannedProPrices } from "./public-plan-comparison";

export async function getVerifiedBillingOffers(country: string, env: AppEnv = getEnv()): Promise<BillingOffers> {
  const market = pricingMarketForCountry(country);
  const verifyPayPal = async (id: string | undefined, interval: "monthly" | "annual") => {
    if (!id || !env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) return null;
    const plan = await fetchPayPalPlan(id, env).catch(() => null);
    return matchesOnboardingPrice(plan, market, interval) ? id : null;
  };
  const paddlePlans = getPaddlePlans(env);
  const verifyPaddle = async (plan: PaddlePlan | undefined) => {
    const id = plan?.priceId;
    if (!plan || env.PADDLE_ENV !== (getDeploymentEnvironment() === "production" ? "live" : "sandbox")) return null;
    if (!id || !env.PADDLE_API_KEY || !env.PADDLE_CLIENT_TOKEN || !env.PADDLE_WEBHOOK_SECRET) return null;
    try {
      const host = env.PADDLE_ENV === "live" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
      const response = await fetch(`${host}/prices/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${env.PADDLE_API_KEY}` },
        signal: AbortSignal.timeout(10_000), cache: "no-store",
      });
      const price = response.ok ? (await response.json()).data : null;
      return (!plan.productId || price?.product_id === plan.productId) && matchesPaddleApprovedPrice(price, country, plan.interval, plan.tier) ? id : null;
    } catch { return null; }
  };
  const [paypalMonthly, paypalAnnual, paddleMonthly, paddleAnnual, proMonthly, proAnnual] = await Promise.all([
    verifyPayPal(env.PAYPAL_MONTHLY_PLAN_ID ?? env.PAYPAL_PRO_PLAN_ID, "monthly"),
    verifyPayPal(env.PAYPAL_ANNUAL_PLAN_ID, "annual"),
    ...(["plus", "pro"] as const).flatMap(tier => (["monthly", "annual"] as const).map(interval => verifyPaddle(paddlePlans.find(plan => plan.tier === tier && plan.interval === interval)))),
  ]);
  return { pro: { paddle: { monthly: proMonthly, annual: proAnnual }, paddlePrices: { monthly: paddlePremiumPricing[market].monthly.label, annual: paddlePremiumPricing[market].annual.label } }, market, prices: plannedProPrices(market), paddlePrices: { monthly: paddleProPricing[market].monthly.label, annual: paddleProPricing[market].annual.label }, paypal: { monthly: paypalMonthly, annual: paypalAnnual }, paddle: { monthly: paddleMonthly, annual: paddleAnnual } };
}
