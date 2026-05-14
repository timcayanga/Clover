import { ScrollReveal } from "../../components/scroll-reveal";
import { LandingNav } from "../../components/landing-nav";
import Link from "next/link";
import { resolvePublicAccountState } from "@/lib/public-account-state";

function FeatureIcon({ name }: { name: "tracking" | "understanding" | "planning" }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "tracking":
      return (
        <svg {...common}>
          <path d="M12 16V5" />
          <path d="m8 9 4-4 4 4" />
          <path d="M5 19h14" />
        </svg>
      );
    case "understanding":
      return (
        <svg {...common}>
          <path d="M4 18h16" />
          <path d="M7 14h2" />
          <path d="M11 10h2" />
          <path d="M15 6h2" />
          <path d="M6 6v12" />
        </svg>
      );
    case "planning":
      return (
        <svg {...common}>
          <path d="M7 20V10" />
          <path d="M12 20V6" />
          <path d="M17 20v-8" />
          <path d="M5 20h14" />
        </svg>
      );
  }
}

function FeatureVisual({
  src,
  alt,
  badge,
}: {
  src: string;
  alt: string;
  badge: string;
}) {
  return (
    <figure className="landing-photo landing-photo--feature">
      <img src={src} alt={alt} />
      <figcaption className="landing-photo__badge">{badge}</figcaption>
    </figure>
  );
}

export default async function FeaturesPage() {
  const accountState = await resolvePublicAccountState();

  return (
    <main className="features-page landing-page">
      <LandingNav accountState={accountState} />

      <ScrollReveal as="section" className="features-page__hero">
        <div className="features-page__copy">
          <span className="pill pill-accent">Features</span>
          <h1>Everything Clover helps you do.</h1>
          <p className="features-page__lede">
            Track your money, understand what changed, and plan the next step with reports and AI insights that keep things simple.
          </p>
          <div className="features-page__actions">
            <Link className="button button-primary button-pill" href="/sign-up" prefetch={false}>
              Get started
            </Link>
            <Link className="button button-secondary button-pill" href="/pricing" prefetch={false}>
              View pricing
            </Link>
          </div>
          <div className="features-page__chips" aria-label="Feature highlights">
            <span>Tracking</span>
            <span>Understanding</span>
            <span>Planning</span>
          </div>
          <div className="features-page__section-markers" aria-hidden="true">
            <span>
              <FeatureIcon name="tracking" />
            </span>
            <span>
              <FeatureIcon name="understanding" />
            </span>
            <span>
              <FeatureIcon name="planning" />
            </span>
          </div>
        </div>

        <FeatureVisual src="/landing-images/hero.jpg" alt="" badge="Turn raw files into a clearer view" />
      </ScrollReveal>

      <ScrollReveal as="section" className="features-page__section" id="tracking">
        <div className="features-page__section-copy">
          <div className="features-page__section-head">
            <span className="features-page__section-icon">
              <FeatureIcon name="tracking" />
            </span>
            <p className="eyebrow">1. Tracking</p>
          </div>
          <h2>Track money from the moment it enters Clover.</h2>
          <p>
            Upload statements, scan receipts, and keep accounts in one place so Clover can organize the basics for you.
          </p>
          <ul className="features-page__list">
            <li>Statement files</li>
            <li>Receipt scanning</li>
            <li>Accounts and transactions in one view</li>
          </ul>
        </div>

        <FeatureVisual src="/landing-images/statement-upload.jpg" alt="" badge="A simple place to add files" />
      </ScrollReveal>

      <ScrollReveal as="section" className="features-page__section features-page__section--reverse" id="understanding">
        <div className="features-page__section-copy">
          <div className="features-page__section-head">
            <span className="features-page__section-icon">
              <FeatureIcon name="understanding" />
            </span>
            <p className="eyebrow">2. Understanding</p>
          </div>
          <h2>Make reports and insights easier to understand.</h2>
          <p>
            Clover pulls your accounts and transactions into one view, then turns the important patterns into clear reports and AI insights.
          </p>
          <ul className="features-page__list">
            <li>Clear transaction grouping</li>
            <li>Easy-to-read reports</li>
            <li>Simple AI summaries</li>
          </ul>
        </div>

        <FeatureVisual src="/landing-images/smart-overview.jpg" alt="" badge="One overview for the full picture" />
      </ScrollReveal>

      <ScrollReveal as="section" className="features-page__section" id="planning">
        <div className="features-page__section-copy">
          <div className="features-page__section-head">
            <span className="features-page__section-icon">
              <FeatureIcon name="planning" />
            </span>
            <p className="eyebrow">3. Planning</p>
          </div>
          <h2>Turn what you learn into a clear next step.</h2>
          <p>
            Open reports to see patterns over time, then use AI insights to decide what to watch, what to adjust, and what to improve.
          </p>
          <ul className="features-page__list">
            <li>What changed this month</li>
            <li>What to keep an eye on</li>
            <li>What to improve next</li>
          </ul>
        </div>

        <FeatureVisual src="/landing-images/reports-ai.jpg" alt="" badge="Reports that are easy to review" />
      </ScrollReveal>

      <ScrollReveal as="section" className="landing-cta">
        <div className="landing-cta__inner">
          <div className="landing-cta__copy">
            <p className="eyebrow">Ready when you are</p>
            <h2>See what Clover can do for your money.</h2>
            <p>Start with the free plan, then upgrade when you need more room for uploads, accounts, reports, and insights.</p>
          </div>
          <div className="landing-cta__actions">
            <Link className="button button-primary button-pill" href="/sign-up" prefetch={false}>
              Sign up
            </Link>
            <Link className="button button-secondary button-pill" href="/pricing" prefetch={false}>
              Pricing
            </Link>
            <Link className="button button-secondary button-pill" href="/sign-in" prefetch={false}>
              Log in
            </Link>
          </div>
        </div>
      </ScrollReveal>

      <footer className="landing-footer" aria-label="Legal links">
        <nav className="landing-footer__nav" aria-label="Legal">
          <Link href="/privacy-policy" prefetch={false}>
            Privacy Policy
          </Link>
          <Link href="/terms-of-service" prefetch={false}>
            Terms of Service
          </Link>
        </nav>
      </footer>
    </main>
  );
}
