import { headers } from "next/headers";
import Link from "next/link";
import { JourneyHeader } from "@/app/landing-preview/landing-journey";
import { PublicFooter } from "@/components/public-footer";
import { PlanComparisonTable } from "@/components/plan-comparison-table";
import { plannedProPrices, plannedPremiumPrices } from "@/lib/public-plan-comparison";
import { PostHogEvent } from "@/components/posthog-analytics";
import { analyticsOnceKey } from "@/lib/analytics";
import { getSessionContext } from "@/lib/auth";
import styles from "./pricing.module.css";

export const metadata = { title: { absolute: "Clover" }, description: "Compare Clover Free, Plus and Pro features and planned regional pricing." };

export default async function PricingPage() {
  const country = (await headers()).get("x-vercel-ip-country")?.toUpperCase();
  const market = country === "PH" ? "ph" : "global";
  const prices = plannedProPrices(market);
  const premium = plannedPremiumPrices(market);
  const session = await getSessionContext().catch(() => null);
  const signedIn = Boolean(session?.userId);
  const proHref = signedIn ? "/settings#billing" : "/sign-up?intent=pro&interval=annual";
  return <main className={styles.page} data-pricing-market={market}>
    <JourneyHeader />
    <PostHogEvent event="upgrade_prompt_viewed" onceKey={analyticsOnceKey("upgrade_prompt_viewed", `pricing:${signedIn ? "signed-in" : "guest"}`)} properties={{ prompt_location: "pricing_page", cta_href: proHref }} />
    <div className={styles.content}>
      <header className={styles.intro}>
        <p className={styles.eyebrow}>Free, Plus and Pro</p>
        <h1>Choose what works for your money.</h1>
        <p>Start with the records you already have. Get more room and deeper insights when you need them.</p>
      </header>
      <aside className={styles.notice}>
        <strong>Plans and allowances</strong>
        <p>Choose the allowance that fits your needs. Existing paid subscriptions retain their billing terms as Plus. Final subscription pricing is shown before payment.</p>
      </aside>
      <section className={styles.plans} aria-label="Planned regional pricing">
        <article><h2>Free</h2><strong>Free</strong><p>Organize your finances with Clover’s core tools.</p><Link className="button button-secondary button-pill" href={signedIn ? "/home" : "/sign-up"}>{signedIn ? "Open Clover" : "Start free"} →</Link></article>
        <article><h2>Plus</h2><strong>{prices.monthly}<small> / month</small></strong><p>Or {prices.annual} per year</p><Link className="button button-primary button-pill" href={proHref}>Upgrade to Plus →</Link><small>You can keep using Clover for free.</small></article>
        <article><h2>Pro</h2><strong>{premium.monthly}<small> / month</small></strong><p>Or {premium.annual} per year</p><p>More accounts, linked banks and AI capacity.</p><Link className="button button-primary button-pill" href={signedIn ? "/settings?plan=premium#billing" : "/sign-up?intent=premium"}>Explore Pro →</Link></article>
      </section>
      <p className={styles.region}>Pricing region: {market === "ph" ? "Philippines · PHP" : "Global · USD"}</p>
      <PlanComparisonTable variant="full" className={styles.table} />
      <section className={styles.notes} aria-label="Plan details">
        <h2>How the allowances work</h2>
        <ul>
          <li>Statement and receipt uploads are included in all plans. AI-assisted processing uses your shared token allowance.</li>
          <li>All plans include Adviser help with creating budgets, goals, and Circles. Plus and Pro add external information and interactive Adviser visuals.</li>
          <li>Limits apply across your Profiles combined. Inactive budgets do not count toward the budget limit. Saved personal goals count toward the goal limit.</li>
          <li>Circle allowances count Circles you create, not invitations you accept.</li>
          <li>AI allowances reset monthly, with a separate rolling 24-hour cap. Cloud and on-device AI share this allowance; offline devices reserve tokens before use.</li>
        <li>Linked bank accounts use Finverse and count toward your financial account allowance. Free supports manual financial accounts without bank linking.</li>
        </ul>
      </section>
    </div>
    <PublicFooter />
  </main>;
}
