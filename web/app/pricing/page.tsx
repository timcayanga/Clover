import Link from "next/link";
import { PlanFeatureItem } from "@/components/plan-feature-item";
import { LandingNav } from "@/components/landing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { PricingProSelector } from "@/components/pricing-pro-selector";
import { PostHogEvent } from "@/components/posthog-analytics";
import { analyticsOnceKey } from "@/lib/analytics";
import { getSessionContext } from "@/lib/auth";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import type { PublicAccountState } from "@/lib/public-account-state";

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

export default async function PricingPage() {
  let session: Awaited<ReturnType<typeof getSessionContext>> | null = null;
  try {
    session = await getSessionContext();
  } catch {
    session = null;
  }
  const user = session?.userId ? await getOrCreateCurrentUser(session.userId) : null;
  const planTier = user?.planTier ?? null;
  const accountState: PublicAccountState = user
    ? {
        signedIn: true,
        displayName: user.firstName ?? user.email?.split("@")[0] ?? "Account",
        avatarUrl: user.imageUrl ?? null,
      }
    : {
        signedIn: false,
        displayName: null,
        avatarUrl: null,
      };

  return (
    <main className="landing-page pricing-page">
      <LandingNav accountState={accountState} />

      <header className="pricing-page__header">
        <h1>Pricing</h1>
      </header>

      <PostHogEvent
        event="upgrade_prompt_viewed"
        onceKey={analyticsOnceKey("upgrade_prompt_viewed", `pricing:${accountState.signedIn ? "signed-in" : "guest"}`)}
        properties={{
          plan_tier: accountState.signedIn ? "free" : "guest",
          prompt_location: "pricing_page",
          cta_href: accountState.signedIn ? "/settings#billing" : "/sign-up",
        }}
      />

      <section className="pricing-page__comparison" aria-label="Clover pricing plans">
        <article className="pricing-card">
            <div className="pricing-card__top">
              <span className="pricing-card__icon">
                <PlanIcon name="starter" />
              </span>
              <div>
                <h2>Free</h2>
              </div>
            </div>
            <p className="pricing-card__summary">
              Organize your finances with the core Clover tools.
            </p>
            <ul className="pricing-card__list">
              <PlanFeatureItem label="Manual transaction tracking" />
              <PlanFeatureItem label="Receipt scanning" />
              <PlanFeatureItem label="5 accounts in addition to Cash" />
              <PlanFeatureItem label="10 monthly uploads total, including statements and receipts" />
              <PlanFeatureItem label="1,000 transaction rows total" />
              <PlanFeatureItem label="Basic investment tracking" />
              <PlanFeatureItem label="Basic reports and Adviser guidance" />
              <PlanFeatureItem label="Basic goal tracking" />
            </ul>
            {!accountState.signedIn ? (
              <Link className="button button-secondary button-pill pricing-card__cta" href="/sign-up?intent=free" prefetch={false}>
                Organize my finances for free
              </Link>
            ) : null}
          </article>

        <article className="pricing-card pricing-card--featured">
            <div className="pricing-card__top">
              <span className="pricing-card__icon pricing-card__icon--featured">
                <PlanIcon name="growth" />
              </span>
              <div>
                <h2>Pro</h2>
              </div>
            </div>
            <p className="pricing-card__summary">
              More room for uploads, accounts, reports, Adviser guidance, and investments.
            </p>
            <ul className="pricing-card__list">
              <PlanFeatureItem label="Manual transaction tracking" />
              <PlanFeatureItem label="20 non-cash accounts" />
              <PlanFeatureItem label="100 monthly uploads total" />
              <PlanFeatureItem label="Unlimited transaction rows" />
              <PlanFeatureItem label="Full investment portfolio tools" />
              <PlanFeatureItem label="Advanced reports and Adviser guidance" />
              <PlanFeatureItem label="Enhanced goal tracking and recommendations" />
            </ul>
            <PricingProSelector
              signedIn={accountState.signedIn}
              planTier={planTier}
            />
          </article>
      </section>

      <MarketingFooter />
    </main>
  );
}
