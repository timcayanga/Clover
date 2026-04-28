import { ScrollReveal } from "../../components/scroll-reveal";
import { LandingNav } from "../../components/landing-nav";
import Link from "next/link";

function FeatureIcon({ name }: { name: "upload" | "understand" | "review" | "plan" }) {
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
    case "upload":
      return (
        <svg {...common}>
          <path d="M12 16V5" />
          <path d="m8 9 4-4 4 4" />
          <path d="M5 19h14" />
        </svg>
      );
    case "understand":
      return (
        <svg {...common}>
          <path d="M4 18h16" />
          <path d="M7 14h2" />
          <path d="M11 10h2" />
          <path d="M15 6h2" />
          <path d="M6 6v12" />
        </svg>
      );
    case "review":
      return (
        <svg {...common}>
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
          <path d="m15 7 2 2 3-3" />
          <path d="m15 12 2 2 3-3" />
        </svg>
      );
    case "plan":
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

export default function FeaturesPage() {
  return (
    <main className="features-page landing-page">
      <LandingNav />

      <ScrollReveal as="section" className="features-page__hero">
        <div className="features-page__copy">
          <span className="pill pill-accent">Features</span>
          <h1>Everything Clover helps you do.</h1>
          <p className="features-page__lede">
            Upload statements and receipts, see all your money together, and get reports and AI insights that make the next step easier.
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
            <span>Upload statements</span>
            <span>Scan receipts</span>
            <span>See accounts together</span>
            <span>Review reports</span>
            <span>Use AI insights</span>
          </div>
          <div className="features-page__section-markers" aria-hidden="true">
            <span>
              <FeatureIcon name="upload" />
            </span>
            <span>
              <FeatureIcon name="understand" />
            </span>
            <span>
              <FeatureIcon name="review" />
            </span>
            <span>
              <FeatureIcon name="plan" />
            </span>
          </div>
        </div>

        <FeatureVisual src="/landing-images/hero.jpg" alt="" badge="Turn raw files into a clearer view" />
      </ScrollReveal>

      <ScrollReveal as="section" className="features-page__section" id="upload">
        <div className="features-page__section-copy">
          <div className="features-page__section-head">
            <span className="features-page__section-icon">
              <FeatureIcon name="upload" />
            </span>
            <p className="eyebrow">1. Upload</p>
          </div>
          <h2>Bring statements and receipts into Clover.</h2>
          <p>
            Upload PDFs and receipt files so Clover can start organizing your finances without manual setup.
          </p>
          <ul className="features-page__list">
            <li>Statement files</li>
            <li>Receipt scanning</li>
            <li>Manual transaction tracking when you need it</li>
          </ul>
        </div>

        <FeatureVisual src="/landing-images/statement-upload.jpg" alt="" badge="A simple place to add files" />
      </ScrollReveal>

      <ScrollReveal as="section" className="features-page__section features-page__section--reverse" id="understand">
        <div className="features-page__section-copy">
          <div className="features-page__section-head">
            <span className="features-page__section-icon">
              <FeatureIcon name="understand" />
            </span>
            <p className="eyebrow">2. Understand</p>
          </div>
          <h2>See your money in a clearer way.</h2>
          <p>
            Clover pulls your accounts and transactions into one view so it is easier to understand where your money goes.
          </p>
          <ul className="features-page__list">
            <li>All your accounts together</li>
            <li>Clear transaction grouping</li>
            <li>Easy-to-read overview</li>
          </ul>
        </div>

        <FeatureVisual src="/landing-images/smart-overview.jpg" alt="" badge="One overview for the full picture" />
      </ScrollReveal>

      <ScrollReveal as="section" className="features-page__section" id="review">
        <div className="features-page__section-copy">
          <div className="features-page__section-head">
            <span className="features-page__section-icon">
              <FeatureIcon name="review" />
            </span>
            <p className="eyebrow">3. Review</p>
          </div>
          <h2>Use reports and AI to spot what matters.</h2>
          <p>
            Open reports to see patterns over time, then use AI insights to get a simpler explanation of what changed.
          </p>
          <ul className="features-page__list">
            <li>Basic and advanced reports</li>
            <li>Monthly pattern checks</li>
            <li>Helpful AI-guided summaries</li>
          </ul>
        </div>

        <FeatureVisual src="/landing-images/reports-ai.jpg" alt="" badge="Reports that are easy to review" />
      </ScrollReveal>

      <ScrollReveal as="section" className="features-page__section features-page__section--compact" id="plan">
        <div className="features-page__section-copy">
          <div className="features-page__section-head">
            <span className="features-page__section-icon">
              <FeatureIcon name="plan" />
            </span>
            <p className="eyebrow">4. Plan</p>
          </div>
          <h2>Turn clearer insights into better next steps.</h2>
          <p>
            Clover helps you decide what to watch, what to adjust, and what to keep improving next month.
          </p>
        </div>
        <div className="features-page__plan-points" aria-label="Planning benefits">
          <span>See what changed</span>
          <span>Spot overspending earlier</span>
          <span>Stay ready for next month</span>
        </div>
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
