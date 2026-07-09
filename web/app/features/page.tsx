import type { Metadata } from "next";
import Link from "next/link";
import { LandingNav } from "@/components/landing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { resolvePublicAccountState } from "@/lib/public-account-state";
import { FEATURE_PAGES } from "@/lib/public-site";

export const metadata: Metadata = {
  title: "Features | Clover",
  description:
    "Explore Clover features for tracking finances, gaining insights, splitting bills, budgeting better, unlocking Pro, and understanding Clover security.",
};

export default async function FeaturesPage() {
  const accountState = await resolvePublicAccountState();

  return (
    <main className="landing-page features-page">
      <LandingNav accountState={accountState} />

      <section className="features-page__hero">
        <div className="features-page__copy">
          <p className="eyebrow">Features</p>
          <h1>Pick the money problem you want Clover to solve first.</h1>
          <p className="features-page__lede">
            Clover is organized around real needs: getting your data in faster, understanding it better, handling shared expenses, building
            practical budgets, and growing into a fuller financial system over time.
          </p>
          <div className="features-page__actions">
            <Link className="button button-primary button-pill" href="/sign-up" prefetch={false}>
              Start seeing clarity for free
            </Link>
            <Link className="button button-secondary button-pill" href="/pricing" prefetch={false}>
              View pricing
            </Link>
          </div>
        </div>

        <div className="feature-detail-page__hero-panel">
          <p className="eyebrow">Browse by need</p>
          <ul>
            {FEATURE_PAGES.map((page) => (
              <li key={page.slug}>{page.navLabel}</li>
            ))}
          </ul>
          <p className="features-page__lede">
            Each page explains the pain point first, then shows how Clover helps solve it in a few simple steps.
          </p>
        </div>
      </section>

      <section className="features-page__grid" aria-label="Feature pages">
        {FEATURE_PAGES.map((page) => (
          <article key={page.slug} className={`features-page__card ${page.featured ? "features-page__card--featured" : ""}`.trim()}>
            <div className="features-page__card-head">
              <p className="eyebrow">{page.heroEyebrow}</p>
              <h2>{page.navLabel}</h2>
            </div>
            <p>{page.overview}</p>
            <ul>
              {(page.sections.length > 0 ? page.sections.map((section) => section.eyebrow) : [page.heroEyebrow]).map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
            <div className="features-page__card-actions">
              <Link className="button button-primary button-pill" href={`/features/${page.slug}`} prefetch={false}>
                Explore {page.shortLabel}
              </Link>
            </div>
          </article>
        ))}
      </section>

      <section className="landing-cta">
        <div className="landing-cta__inner">
          <div className="landing-cta__copy">
            <p className="eyebrow">Start where the pain is</p>
            <h2>Pick the workflow you need first and build from there.</h2>
            <p>
              Most people begin with imports and transaction cleanup, then grow into insights, budgets, shared bills, and Pro once Clover has more
              of the full picture.
            </p>
          </div>
          <div className="landing-cta__actions">
            <Link className="button button-primary button-pill" href="/sign-up" prefetch={false}>
              Create an account
            </Link>
            <Link className="button button-secondary button-pill" href="/help" prefetch={false}>
              Visit help
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}
