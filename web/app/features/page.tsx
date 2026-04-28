import { ScrollReveal } from "../../components/scroll-reveal";
import { LandingNav } from "../../components/landing-nav";
import Link from "next/link";

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
        </div>

        <FeatureVisual src="/landing-images/hero.jpg" alt="" badge="Turn raw files into a clearer view" />
      </ScrollReveal>

      <ScrollReveal as="section" className="features-page__section">
        <div className="features-page__section-copy">
          <p className="eyebrow">1. Upload</p>
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

      <ScrollReveal as="section" className="features-page__section features-page__section--reverse">
        <div className="features-page__section-copy">
          <p className="eyebrow">2. Understand</p>
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

      <ScrollReveal as="section" className="features-page__section">
        <div className="features-page__section-copy">
          <p className="eyebrow">3. Review</p>
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

      <ScrollReveal as="section" className="features-page__section features-page__section--compact">
        <div className="features-page__section-copy">
          <p className="eyebrow">4. Plan</p>
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
