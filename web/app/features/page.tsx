import type { Metadata } from "next";
import Link from "next/link";
import { LandingNav } from "@/components/landing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { resolvePublicAccountState } from "@/lib/public-account-state";
import { FEATURE_PAGES } from "@/lib/public-site";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Explore how Clover helps you manage money, gain insights, plan ahead, handle shared finances, protect your data, and grow with Pro.",
};

export default async function FeaturesPage() {
  const accountState = await resolvePublicAccountState();

  return (
    <main className="landing-page features-page">
      <LandingNav accountState={accountState} />

      <section className="features-page__hero">
        <div className="features-page__copy">
          <p className="eyebrow">Features</p>
          <h1>Start with what you need from your money.</h1>
          <p className="features-page__lede">
            Clover follows the same path inside and outside the app: organize what you have, understand what changed, plan what comes next,
            and work with other people when money is shared.
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
            Each page begins with the need, then shows how Clover helps without making you learn the product first.
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
            <p className="eyebrow">Start where you are</p>
            <h2>Organize the present, then make the next decision clearer.</h2>
            <p>
              Most people begin by bringing in their records. As Clover learns more of the picture, insights, plans, shared money, and Pro become
              more useful naturally.
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
