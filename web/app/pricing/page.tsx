import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { BillingActions } from "@/components/billing-actions";
import { getEnv } from "@/lib/env";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { getUserBillingSubscription } from "@/lib/paypal-billing";

function PlanIcon({ name }: { name: "starter" | "growth" }) {
  const common = {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "starter") {
    return (
      <svg {...common}>
        <path d="M12 3 4 8l8 5 8-5-8-5Z" />
        <path d="M4 16l8 5 8-5" />
        <path d="M4 12l8 5 8-5" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M4 19V5" />
      <path d="M8 15l4-4 4 3 4-6" />
      <path d="M16 8h4v4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m20 6-11 11-5-5" />
    </svg>
  );
}

export default async function PricingPage() {
  const session = await auth();
  const env = getEnv();
  const user = session.userId ? await getOrCreateCurrentUser(session.userId) : null;
  const billingSubscription = user ? await getUserBillingSubscription(user.id) : null;

  return (
    <main className="legal-page pricing-page">
      <div className="legal-page__inner pricing-page__inner">
        <nav className="legal-page__nav" aria-label="Pricing page navigation">
          <Link className="landing-brand" href="/" aria-label="Clover home">
            <img className="landing-brand__mark" src="/clover-mark.svg" alt="" aria-hidden="true" />
            <img className="landing-brand__wordmark" src="/clover-name-teal.svg" alt="Clover" />
          </Link>
          <div className="legal-page__nav-links">
            <Link href="/">Home</Link>
            <Link href="/pricing" aria-current="page">
              Pricing
            </Link>
            {user ? <Link href="/settings#billing">Billing</Link> : <Link href="/sign-in">Log in</Link>}
            {user ? <Link href="/settings">App</Link> : <Link href="/sign-up">Sign up</Link>}
          </div>
        </nav>

        <header className="pricing-page__header">
          <span className="legal-page__eyebrow">Clover</span>
          <h1>Pricing</h1>
          <p>Choose a plan that fits the way you want to understand your money.</p>
          <p>Start free if you want to explore Clover first. Upgrade to Pro when you need higher limits and advanced reports.</p>
        </header>

        <section className="pricing-page__comparison" aria-label="Clover pricing plans">
          <article className="pricing-card">
            <div className="pricing-card__top">
              <span className="pricing-card__icon">
                <PlanIcon name="starter" />
              </span>
              <div>
                <p className="pricing-card__eyebrow">Free</p>
                <h2>Try Clover and build a lighter overview.</h2>
              </div>
            </div>
            <p className="pricing-card__summary">
              Great for getting started, importing a smaller set of statements, and seeing the value of Clover before you upgrade.
            </p>
            <ul className="pricing-card__list">
              <li>
                <CheckIcon />
                <span>Manual transaction tracking.</span>
              </li>
              <li>
                <CheckIcon />
                <span>Receipt scanning.</span>
              </li>
              <li>
                <CheckIcon />
                <span>5 accounts in addition to Cash.</span>
              </li>
              <li>
                <CheckIcon />
                <span>10 monthly uploads total, including statements and receipts.</span>
              </li>
              <li>
                <CheckIcon />
                <span>1,000 transaction rows total.</span>
              </li>
              <li>
                <CheckIcon />
                <span>Basic reports.</span>
              </li>
            </ul>
          </article>

          <article className="pricing-card pricing-card--featured">
            <div className="pricing-card__top">
              <span className="pricing-card__icon pricing-card__icon--featured">
                <PlanIcon name="growth" />
              </span>
              <div>
                <p className="pricing-card__eyebrow">Pro</p>
                <h2>Unlock the full value of Clover.</h2>
              </div>
            </div>
            <p className="pricing-card__summary">
              Built for people who want to track more, upload more, and get deeper insights without running into monthly limits.
            </p>
            <p className="pricing-card__summary pricing-card__summary--strong">
              PHP 149 monthly or PHP 1,299 annually.
            </p>
            <ul className="pricing-card__list">
              <li>
                <CheckIcon />
                <span>Manual transaction tracking.</span>
              </li>
              <li>
                <CheckIcon />
                <span>20 accounts.</span>
              </li>
              <li>
                <CheckIcon />
                <span>100 monthly uploads total.</span>
              </li>
              <li>
                <CheckIcon />
                <span>Unlimited transaction rows.</span>
              </li>
              <li>
                <CheckIcon />
                <span>Advanced reports.</span>
              </li>
            </ul>
          </article>
        </section>

        <section className="pricing-page__value">
          <div>
            <p className="eyebrow">Why Pro matters</p>
            <h2>More room means more clarity.</h2>
          </div>
          <p>
            Clover is most useful when it can see a fuller picture of your money. Pro gives you the headroom to bring in more statements, organize
            more of your finances, and get better reports over time.
          </p>
        </section>

        <section className="pricing-page__refunds">
          <p className="eyebrow">Refund policy</p>
          <h2>Refund terms will be published before paid billing starts.</h2>
          <p>
            When paid subscriptions are enabled, Clover will publish the billing terms, renewal terms, and refund policy that apply at the time of
            purchase. Unless required by law or stated otherwise in the then-current policy, charges may not be refundable.
          </p>
        </section>

        <section className="pricing-page__cta">
          <h2>Start with the plan that fits your current needs.</h2>
          {user ? (
            <p className="pricing-page__cta-copy">
              You are signed in, so you can upgrade or switch plans right here. Clover uses your current account to match the subscription
              automatically.
            </p>
          ) : (
            <p className="pricing-page__cta-copy">
              Sign up first, then choose the plan you want from Settings or come back here to upgrade after you have an account.
            </p>
          )}
          {user ? (
            <BillingActions
              planTier={user.planTier}
              clientId={env.PAYPAL_CLIENT_ID ?? null}
              monthlyPlanId={env.PAYPAL_MONTHLY_PLAN_ID ?? env.PAYPAL_PRO_PLAN_ID ?? null}
              annualPlanId={env.PAYPAL_ANNUAL_PLAN_ID ?? null}
              customId={user.id}
              returnPath="/pricing"
              subscription={
                billingSubscription
                  ? {
                      status: billingSubscription.status,
                      interval: billingSubscription.interval,
                      pendingPlanId: billingSubscription.pendingPlanId,
                      pendingInterval: billingSubscription.pendingInterval,
                      providerSubscriptionId: billingSubscription.providerSubscriptionId,
                      currentPeriodEnd: billingSubscription.currentPeriodEnd ? billingSubscription.currentPeriodEnd.toISOString() : null,
                      nextBillingTime: billingSubscription.nextBillingTime ? billingSubscription.nextBillingTime.toISOString() : null,
                      planTier: billingSubscription.planTier,
                    }
                  : null
              }
              className="pricing-page__billing-actions"
            />
          ) : null}
          <div className="pricing-page__cta-actions">
            {user ? (
              <>
                <Link className="button button-primary button-pill" href="/settings#billing">
                  Manage billing
                </Link>
                <Link className="button button-secondary button-pill" href="/dashboard">
                  Go to dashboard
                </Link>
              </>
            ) : (
              <>
                <Link className="button button-primary button-pill" href="/sign-up">
                  Get started
                </Link>
                <Link className="button button-secondary button-pill" href="/sign-in">
                  Log in
                </Link>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
