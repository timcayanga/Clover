import { getPaddlePlans, type PaddlePlan } from "./paddle-plans";
import { getDeploymentEnvironment } from "./deployment-environment";
import { getEnv, type AppEnv } from "./env";
import { fetchPayPalPlan } from "./paypal-billing";
import { matchesOnboardingPrice } from "./onboarding-pricing";
import { matchesPaddleApprovedPrice, pricingMarketForCountry, paddleProPricing, paddlePremiumPricing, type BillingOffers } from "./billing-offer-rules";
import { plannedProPrices } from "./public-plan-comparison";

const reported = new Set<string>();
function unavailable(provider: string, reason: string, market: string, plan: string) {
  const key = `${provider}:${reason}:${market}:${plan}`;
  if (!reported.has(key)) {
    reported.add(key);
    console.warn("billing_offer_unavailable", { provider, reason, market, plan });
  }
  return null;
}

export async function getVerifiedBillingOffers(country: string, env: AppEnv = getEnv()): Promise<BillingOffers> {
  const market = pricingMarketForCountry(country);
  const verifyPayPal = async (id: string | undefined, interval: "monthly" | "annual") => {
    if (!id || !env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) return unavailable("paypal", "configuration_missing", market, interval);
    const plan = await fetchPayPalPlan(id, env).catch(() => null);
    return matchesOnboardingPrice(plan, market, interval) ? id : unavailable("paypal", plan ? "unapproved_price" : "provider_unavailable", market, interval);
  };
  const paddlePlans = getPaddlePlans(env);
  const verifyPaddle = async (plan: PaddlePlan | undefined) => {
    const id = plan?.priceId;
    if (!plan) return unavailable("paddle", "plan_missing", market, "unknown");
    const label = `${plan.tier}:${plan.interval}`;
    if (env.PADDLE_ENV !== (getDeploymentEnvironment() === "production" ? "live" : "sandbox")) return unavailable("paddle", "environment_mismatch", market, label);
    if (!id || !env.PADDLE_API_KEY || !env.PADDLE_CLIENT_TOKEN || !env.PADDLE_WEBHOOK_SECRET) return unavailable("paddle", "configuration_missing", market, label);
    try {
      const host = env.PADDLE_ENV === "live" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
      const response = await fetch(`${host}/prices/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${env.PADDLE_API_KEY}` },
        signal: AbortSignal.timeout(10_000), cache: "no-store",
      });
      if (!response.ok) return unavailable("paddle", `provider_http_${response.status}`, market, label);
      const price = (await response.json()).data;
      if (plan.productId && price?.product_id !== plan.productId) return unavailable("paddle", "product_mismatch", market, label);
      return matchesPaddleApprovedPrice(price, country, plan.interval, plan.tier) ? id : unavailable("paddle", "unapproved_price", market, label);
    } catch { return unavailable("paddle", "provider_unavailable", market, label); }
  };
  const [paypalMonthly, paypalAnnual, paddleMonthly, paddleAnnual, proMonthly, proAnnual] = await Promise.all([
    verifyPayPal(env.PAYPAL_MONTHLY_PLAN_ID ?? env.PAYPAL_PRO_PLAN_ID, "monthly"),
    verifyPayPal(env.PAYPAL_ANNUAL_PLAN_ID, "annual"),
    ...(["plus", "pro"] as const).flatMap(tier => (["monthly", "annual"] as const).map(interval => verifyPaddle(paddlePlans.find(plan => plan.tier === tier && plan.interval === interval)))),
  ]);
  return { pro: { paddle: { monthly: proMonthly, annual: proAnnual }, paddlePrices: { monthly: paddlePremiumPricing[market].monthly.label, annual: paddlePremiumPricing[market].annual.label } }, market, prices: plannedProPrices(market), paddlePrices: { monthly: paddleProPricing[market].monthly.label, annual: paddleProPricing[market].annual.label }, paypal: { monthly: paypalMonthly, annual: paypalAnnual }, paddle: { monthly: paddleMonthly, annual: paddleAnnual } };
}
