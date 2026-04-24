import { ScrollReveal } from "../components/scroll-reveal";
import Link from "next/link";

function StepIcon({ name }: { name: "upload" | "insights" | "decision" }) {
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

  switch (name) {
    case "upload":
      return (
        <svg {...common}>
          <path d="M12 16V5" />
          <path d="m8 9 4-4 4 4" />
          <path d="M5 19h14" />
        </svg>
      );
    case "insights":
      return (
        <svg {...common}>
          <path d="M5 19V9" />
          <path d="M10 19V5" />
          <path d="M15 19v-7" />
          <path d="M20 19V7" />
        </svg>
      );
    case "decision":
      return (
        <svg {...common}>
          <path d="m6 13 4 4 8-8" />
          <path d="M12 3a9 9 0 1 0 9 9" />
        </svg>
      );
  }
}

function HeroImage() {
  return (
    <figure className="landing-photo landing-photo--hero" aria-hidden="true">
      <img src="/landing-images/hero.jpg" alt="" />
      <div className="landing-photo__overlay">
        <div className="landing-photo__chips" aria-hidden="true">
          <span>Upload PDFs</span>
          <span>Review reports</span>
          <span>AI insights</span>
        </div>
      </div>
      <figcaption className="landing-photo__badge">Clear, confident, and in control</figcaption>
    </figure>
  );
}

function VisualGallery() {
  return (
    <div className="landing-gallery">
      <div className="landing-gallery__layout">
        <figure className="landing-photo landing-photo--gallery">
          <img src="/landing-images/statement-upload.jpg" alt="" />
          <figcaption className="landing-photo__badge">Upload statements</figcaption>
        </figure>

        <figure className="landing-photo landing-photo--gallery">
          <img src="/landing-images/reports-ai.jpg" alt="" />
          <figcaption className="landing-photo__badge">Reports and AI</figcaption>
        </figure>

        <figure className="landing-photo landing-photo--gallery">
          <img src="/landing-images/smart-overview.jpg" alt="" />
          <figcaption className="landing-photo__badge">A smarter overview</figcaption>
        </figure>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="landing-page">
      <ScrollReveal as="header" className="landing-nav landing-nav--sticky">
        <Link className="landing-brand" href="/" aria-label="Clover home">
          <img className="landing-brand__mark" src="/clover-mark.svg" alt="" aria-hidden="true" />
          <img className="landing-brand__wordmark" src="/clover-name-teal.svg" alt="Clover" />
        </Link>

        <nav className="landing-nav__links" aria-label="Primary">
          <Link className="landing-nav__link" href="/pricing">
            Pricing
          </Link>
          <Link className="landing-nav__link" href="/sign-in">
            Log in
          </Link>
          <Link className="button button-primary landing-nav__button" href="/sign-up">
            Sign up
          </Link>
        </nav>
      </ScrollReveal>

      <ScrollReveal as="section" className="landing-hero">
        <div className="landing-hero__copy">
          <span className="pill pill-accent">Money clarity, made simple</span>
          <h1>8 hours a week, turned into minutes.</h1>
          <p className="landing-hero__lede">
            Tracking finances takes time. Clover helps you upload statements, see every account together, and turn that data into faster reports,
            insights, and smarter money moves.
          </p>

          <div className="landing-hero__actions">
            <Link className="button button-primary button-pill" href="/sign-up">
              Get started
            </Link>
            <Link className="button button-secondary button-pill" href="/sign-in">
              Log in
            </Link>
          </div>

          <p className="landing-hero__note">Spend less time sorting through numbers and more time making smarter money moves.</p>
        </div>

        <HeroImage />
      </ScrollReveal>

      <ScrollReveal as="section" className="landing-gallery-section">
        <div className="landing-gallery__copy">
          <p className="eyebrow">Visual overview</p>
          <h2>See every account in one view.</h2>
          <p>
            Clover turns uploaded statements into a clearer overview so you can spot patterns without manual sorting.
          </p>
        </div>

        <VisualGallery />
      </ScrollReveal>

      <ScrollReveal as="section" className="landing-flow">
        <div className="landing-flow__copy">
          <p className="eyebrow">How it works</p>
          <h2>From statements to useful insights.</h2>
        </div>

        <div className="landing-flow__steps" aria-label="How Clover works">
          <div className="landing-flow__step">
            <span className="landing-flow__icon">
              <StepIcon name="upload" />
            </span>
            <span className="landing-flow__number">01</span>
            <h3>See everything together</h3>
            <p>Bring in statement files so Clover can build a single financial overview.</p>
          </div>
          <div className="landing-flow__step">
            <span className="landing-flow__icon">
              <StepIcon name="insights" />
            </span>
            <span className="landing-flow__number">02</span>
            <h3>Spot patterns faster</h3>
            <p>Clover surfaces reports and trends so spending changes are easier to notice.</p>
          </div>
          <div className="landing-flow__step">
            <span className="landing-flow__icon">
              <StepIcon name="decision" />
            </span>
            <span className="landing-flow__number">03</span>
            <h3>Plan your next move</h3>
            <p>Use the clearer view and AI-guided insights to make better decisions.</p>
          </div>
        </div>
      </ScrollReveal>

      <ScrollReveal as="section" className="landing-cta">
        <div className="landing-cta__inner">
          <div className="landing-cta__copy">
            <p className="eyebrow">Ready when you are</p>
            <h2>Keep your finances in view, whenever you need them.</h2>
            <p>
              Clover stays with you as a clear place to upload statements, review insights, and take action with confidence.
            </p>
          </div>
          <div className="landing-cta__actions">
            <Link className="button button-primary button-pill" href="/sign-up">
              Sign up
            </Link>
            <Link className="button button-secondary button-pill" href="/sign-in">
              Log in
            </Link>
          </div>
        </div>
      </ScrollReveal>

      <footer className="landing-footer" aria-label="Legal links">
        <nav className="landing-footer__nav" aria-label="Legal">
          <Link href="/privacy-policy">Privacy Policy</Link>
          <Link href="/terms-of-service">Terms of Service</Link>
        </nav>
      </footer>
    </main>
  );
}
