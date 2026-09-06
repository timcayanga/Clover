import { headers } from "next/headers";
import Link from "next/link";
import { JourneyHeader } from "@/app/landing-preview/landing-journey";
import { PublicFooter } from "@/components/public-footer";
import { PlanComparisonTable } from "@/components/plan-comparison-table";
import { plannedProPrices } from "@/lib/public-plan-comparison";
import { PostHogEvent } from "@/components/posthog-analytics";
import { analyticsOnceKey } from "@/lib/analytics";
import { getSessionContext } from "@/lib/auth";
import styles from "./pricing.module.css";

export const metadata = { title: { absolute: "Clover" }, description: "Compare Clover Free and Pro features and planned regional pricing." };

export default async function PricingPage() {
  const country = (await headers()).get("x-vercel-ip-country")?.toUpperCase();
  const market = country === "PH" ? "ph" : "global";
  const prices = plannedProPrices(market);
  const session = await getSessionContext().catch(() => null);
  const signedIn = Boolean(session?.userId);
  const proHref = signedIn ? "/settings#billing" : "/sign-up?intent=pro&interval=annual";
  return <main className={styles.page} data-pricing-market={market}>
    <JourneyHeader />
    <PostHogEvent event="upgrade_prompt_viewed" onceKey={analyticsOnceKey("upgrade_prompt_viewed", `pricing:${signedIn ? "signed-in" : "guest"}`)} properties={{ prompt_location: "pricing_page", cta_href: proHref }} />
    <div className={styles.content}>
      <header className={styles.intro}>
        <p className={styles.eyebrow}>Free and Pro</p>
        <h1>Choose what works for your money.</h1>
        <p>Start with the records you already have. Get more room and deeper insights when you need them.</p>
      </header>
      <aside className={styles.notice}>
        <strong>Planned pricing and limits</strong>
        <p>These limits are not enforced during beta. We’ll notify you before they take effect. Final subscription pricing is shown before payment.</p>
      </aside>
      <section className={styles.plans} aria-label="Planned regional pricing">
        <article><h2>Free</h2><strong>Free</strong><p>Organize your finances with Clover’s core tools.</p><Link className="button button-secondary button-pill" href={signedIn ? "/home" : "/sign-up"}>{signedIn ? "Open Clover" : "Start free"} →</Link></article>
        <article><h2>Pro</h2><strong>{prices.monthly}<small> / month</small></strong><p>Or {prices.annual} per year</p><Link className="button button-primary button-pill" href={proHref}>Upgrade to Pro →</Link><small>You can keep using Clover for free.</small></article>
      </section>
      <p className={styles.region}>Pricing region: {market === "ph" ? "Philippines · PHP" : "Global · USD"}</p>
      <PlanComparisonTable variant="full" className={styles.table} />
      <section className={styles.notes} aria-label="Plan details">
        <h2>How the planned allowances work</h2>
        <ul>
          <li>Statement and receipt uploads are included in both plans. Upload allowances and file limits are still being finalized.</li>
          <li>Both plans include Adviser help with creating budgets, goals, and Circles. Pro adds external information and interactive Adviser visuals.</li>
          <li>Limits apply across your Profiles combined. Completed or archived budgets and goals do not count toward active limits.</li>
          <li>Circle allowances count Circles you create, not invitations you accept.</li>
          <li>AI allowances reset monthly, with a separate rolling 24-hour cap. Detailed usage accounting will be confirmed before enforcement begins.</li>
        </ul>
      </section>
    </div>
    <PublicFooter />
  </main>;
}
