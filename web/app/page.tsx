import { ScrollReveal } from "../components/scroll-reveal";
import { LandingNav } from "../components/landing-nav";
import { MobileCarousel } from "../components/mobile-carousel";
import Link from "next/link";

function StepIcon({ name }: { name: "upload" | "insights" | "decision" }) {
  const icons = {
    upload: "/landing-icons/upload3d.png",
    insights: "/landing-icons/analyze.png",
    decision: "/landing-icons/plan.png",
  } as const;

  return <img src={icons[name]} alt="" aria-hidden="true" loading="lazy" decoding="async" />;
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

function VisualGalleryCarousel() {
  return (
    <MobileCarousel
      className="landing-gallery__mobile"
      ariaLabel="Visual overview carousel"
      labels={["Upload statements", "Reports and AI", "A smarter overview"]}
      slides={[
        <figure className="landing-photo landing-photo--gallery" key="statement-upload">
          <img src="/landing-images/statement-upload.jpg" alt="" />
          <figcaption className="landing-photo__badge">Upload statements</figcaption>
        </figure>,
        <figure className="landing-photo landing-photo--gallery" key="reports-ai">
          <img src="/landing-images/reports-ai.jpg" alt="" />
          <figcaption className="landing-photo__badge">Reports and AI</figcaption>
        </figure>,
        <figure className="landing-photo landing-photo--gallery" key="smart-overview">
          <img src="/landing-images/smart-overview.jpg" alt="" />
          <figcaption className="landing-photo__badge">A smarter overview</figcaption>
        </figure>,
      ]}
    />
  );
}

function StepIconMobile({ name }: { name: "upload" | "insights" | "decision" }) {
  return <StepIcon name={name} />;
}

function HowItWorksCarousel() {
  return (
    <MobileCarousel
      className="landing-flow__mobile"
      ariaLabel="How Clover works carousel"
      labels={["Upload", "Analyze", "Plan"]}
      controlsPlacement="footer"
      slides={[
        <article className="landing-flow__step" key="upload">
          <span className="landing-flow__icon">
            <StepIconMobile name="upload" />
          </span>
          <span className="landing-flow__number">01</span>
          <h3>Upload</h3>
          <p>Add your statements and receipts so Clover can start organizing them for you.</p>
        </article>,
        <article className="landing-flow__step" key="analyze">
          <span className="landing-flow__icon">
            <StepIconMobile name="insights" />
          </span>
          <span className="landing-flow__number">02</span>
          <h3>Analyze</h3>
          <p>Clover spots patterns in your money and shows what changed in a simple way.</p>
        </article>,
        <article className="landing-flow__step" key="plan">
          <span className="landing-flow__icon">
            <StepIconMobile name="decision" />
          </span>
          <span className="landing-flow__number">03</span>
          <h3>Plan</h3>
          <p>Use reports and insights to make smarter money decisions going forward.</p>
        </article>,
      ]}
    />
  );
}

export default function HomePage() {
  return (
    <main className="landing-page">
      <LandingNav />

      <ScrollReveal as="section" className="landing-hero">
        <div className="landing-hero__copy">
          <h1>8 hours a week, turned into minutes.</h1>
          <p className="landing-hero__lede">
            Tracking finances takes time. Clover helps you upload statements, see every account together, and turn that data into faster reports,
            insights, and smarter money moves.
          </p>

          <div className="landing-hero__actions">
            <Link className="button button-primary button-pill" href="/sign-up" prefetch={false}>
              Get started
            </Link>
            <Link className="button button-secondary button-pill" href="/sign-in" prefetch={false}>
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
        <VisualGalleryCarousel />
      </ScrollReveal>

      <ScrollReveal as="section" className="landing-flow">
        <div className="landing-flow__copy">
          <p className="eyebrow">How it works</p>
          <h2>Three simple steps.</h2>
        </div>

        <div className="landing-flow__steps" aria-label="How Clover works">
          <div className="landing-flow__step">
            <span className="landing-flow__icon">
              <StepIcon name="upload" />
            </span>
            <span className="landing-flow__number">01</span>
            <h3>Upload</h3>
            <p>Add your statements and receipts so Clover can start organizing them for you.</p>
          </div>
          <div className="landing-flow__step">
            <span className="landing-flow__icon">
              <StepIcon name="insights" />
            </span>
            <span className="landing-flow__number">02</span>
            <h3>Analyze</h3>
            <p>Clover spots patterns in your money and shows what changed in a simple way.</p>
          </div>
          <div className="landing-flow__step">
            <span className="landing-flow__icon">
              <StepIcon name="decision" />
            </span>
            <span className="landing-flow__number">03</span>
            <h3>Plan</h3>
            <p>Use reports and insights to make smarter money decisions going forward.</p>
          </div>
        </div>

        <HowItWorksCarousel />
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
          <Link href="/contact-us" prefetch={false}>
            Contact Us
          </Link>
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
