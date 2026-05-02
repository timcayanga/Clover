import { ScrollReveal } from "../components/scroll-reveal";
import { LandingNav } from "../components/landing-nav";
import { MobileCarousel } from "../components/mobile-carousel";
import Link from "next/link";
import Script from "next/script";

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
      <Script id="landing-force-light-theme" strategy="beforeInteractive">
        {`
          try {
            document.documentElement.dataset.theme = "light";
            document.documentElement.style.colorScheme = "light";
          } catch (error) {}
        `}
      </Script>
      <LandingNav />

      <ScrollReveal as="section" className="landing-hero">
        <div className="landing-hero__copy">
          <h1>Turn money clutter into clarity.</h1>
          <p className="landing-hero__lede">
            Clover helps you gather statements, receipts, and accounts so you can understand what is happening without digging through folders,
            PDFs, and spreadsheets.
          </p>

          <div className="landing-hero__actions">
            <Link className="button button-primary button-pill" href="/sign-up" prefetch={false}>
              Get started
            </Link>
            <Link className="button button-secondary button-pill" href="/sign-in" prefetch={false}>
              Log in
            </Link>
          </div>

          <p className="landing-hero__note">Less guesswork. More confidence about what comes next.</p>
        </div>

        <HeroImage />
      </ScrollReveal>

      <ScrollReveal as="section" className="landing-gallery-section">
        <div className="landing-gallery__copy">
          <p className="eyebrow">Visual overview</p>
          <h2>From scattered files to a clear picture.</h2>
          <p>
            Upload the things you already have. Clover organizes them into an overview that makes your finances easier to understand.
          </p>
        </div>

        <VisualGallery />
        <VisualGalleryCarousel />
      </ScrollReveal>

      <ScrollReveal as="section" className="landing-flow">
        <div className="landing-flow__copy">
          <p className="eyebrow">How it works</p>
          <h2>A simple path from upload to action.</h2>
        </div>

        <div className="landing-flow__steps" aria-label="How Clover works">
          <div className="landing-flow__step">
            <span className="landing-flow__icon">
              <StepIcon name="upload" />
            </span>
            <span className="landing-flow__number">01</span>
            <h3>Upload</h3>
            <p>Bring in the statements and receipts you have been putting off. Clover starts the cleanup for you.</p>
          </div>
          <div className="landing-flow__step">
            <span className="landing-flow__icon">
              <StepIcon name="insights" />
            </span>
            <span className="landing-flow__number">02</span>
            <h3>Analyze</h3>
            <p>See what changed, what stands out, and what needs attention in a way that feels easy to follow.</p>
          </div>
          <div className="landing-flow__step">
            <span className="landing-flow__icon">
              <StepIcon name="decision" />
            </span>
            <span className="landing-flow__number">03</span>
            <h3>Plan</h3>
            <p>Know your next move so the next month feels more intentional and less reactive.</p>
          </div>
        </div>

        <HowItWorksCarousel />
      </ScrollReveal>

      <ScrollReveal as="section" className="landing-trust">
        <div className="landing-trust__copy">
          <p className="eyebrow">Trust and security</p>
          <h2>Built to keep your data clear, private, and easy to review.</h2>
          <p>
            Clover is designed so your financial files, insights, and history stay organized and traceable while you stay in control of what
            you upload and what you learn from it.
          </p>
        </div>

        <div className="landing-trust__grid" aria-label="Trust and security highlights">
          <article className="landing-trust-card">
            <p className="landing-trust-card__eyebrow">Traceable files</p>
            <h3>Your uploads stay tied to their source.</h3>
            <p>Statements and receipts remain easy to reference later, so you can always go back to the original file if you need to.</p>
          </article>
          <article className="landing-trust-card">
            <p className="landing-trust-card__eyebrow">Clear history</p>
            <h3>Reviews and changes stay understandable.</h3>
            <p>As you organize your money, Clover keeps the path from raw file to insight easier to follow.</p>
          </article>
          <article className="landing-trust-card">
            <p className="landing-trust-card__eyebrow">Privacy-minded</p>
            <h3>You keep control of the information you share.</h3>
            <p>Clover is meant to help you manage money with confidence, not make your finances feel more exposed.</p>
          </article>
        </div>

        <p className="landing-trust__note">
          Want the details? Read our{" "}
          <Link href="/privacy-policy" prefetch={false}>
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link href="/terms-of-service" prefetch={false}>
            Terms of Service
          </Link>
          .
        </p>
      </ScrollReveal>

      <ScrollReveal as="section" className="landing-cta">
        <div className="landing-cta__inner">
          <div className="landing-cta__copy">
            <p className="eyebrow">Ready when you are</p>
            <h2>Start with clarity. Grow into more control.</h2>
            <p>
              Begin free, then move to Pro when you want more accounts, more uploads, and deeper reports that help you stay ahead.
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
