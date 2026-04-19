import { ScrollReveal } from "../components/scroll-reveal";
import Link from "next/link";

function HeroImage() {
  return (
    <figure className="landing-photo landing-photo--hero" aria-hidden="true">
      <img src="/landing-images/hero.jpg" alt="" />
      <div className="landing-photo__overlay">
        <span className="landing-photo__eyebrow">In one place</span>
        <div className="landing-photo__chips" aria-hidden="true">
          <span>Upload PDFs</span>
          <span>Review reports</span>
          <span>AI insights</span>
        </div>
      </div>
      <figcaption className="landing-photo__badge">Calm, clear, and confident</figcaption>
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
          <img className="landing-brand__mark" src="/favicon.svg" alt="" aria-hidden="true" />
          <span>Clover</span>
        </Link>

        <nav className="landing-nav__links" aria-label="Primary">
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
          <span className="pill pill-accent">Money clarity, made calm</span>
          <h1>A smarter way to see your money.</h1>
          <p className="landing-hero__lede">
            Clover helps people upload statements, understand their finances, and discover meaningful insights through reports and AI.
          </p>

          <div className="landing-hero__actions">
            <Link className="button button-primary button-pill" href="/sign-up">
              Get started
            </Link>
            <Link className="button button-secondary button-pill" href="/sign-in">
              Log in
            </Link>
          </div>

          <p className="landing-hero__note">Friendly, professional, and trustworthy by design.</p>
        </div>

        <HeroImage />
      </ScrollReveal>

      <ScrollReveal as="section" className="landing-gallery-section">
        <div className="landing-gallery__copy">
          <p className="eyebrow">Visual overview</p>
          <h2>See statements, spending, and sources in one calm place.</h2>
          <p>
            Clover makes the financial picture easier to read with a visual-first layout built for clarity, confidence, and faster decisions.
          </p>
        </div>

        <VisualGallery />
      </ScrollReveal>

      <ScrollReveal as="section" className="landing-flow">
        <div className="landing-flow__copy">
          <p className="eyebrow">How it works</p>
          <h2>A simple flow from statement upload to confident decisions.</h2>
        </div>

        <div className="landing-flow__steps" aria-label="How Clover works">
          <div className="landing-flow__step">
            <span className="landing-flow__number">01</span>
            <h3>Upload statements</h3>
            <p>Bring in statement files so Clover can start building your financial overview.</p>
          </div>
          <div className="landing-flow__step">
            <span className="landing-flow__number">02</span>
            <h3>Review insights</h3>
            <p>See reports, categories, and patterns that turn raw transactions into something useful.</p>
          </div>
          <div className="landing-flow__step">
            <span className="landing-flow__number">03</span>
            <h3>Make better decisions</h3>
            <p>Use the clearer view and AI-guided insights to understand what matters most.</p>
          </div>
        </div>
      </ScrollReveal>

      <ScrollReveal as="section" className="landing-trust">
        <p className="landing-trust__quote">
          A calmer way to understand your finances, all in one place.
        </p>
        <p className="landing-trust__note">
          Clover keeps the experience friendly, professional, and trustworthy from the first upload to the last insight.
        </p>
      </ScrollReveal>

      <ScrollReveal as="section" className="landing-cta">
        <div className="landing-cta__copy">
          <p className="eyebrow">Ready when you are</p>
          <h2>Keep your finances in view, whenever you need them.</h2>
          <p>
            Clover stays with you as a calm place to upload statements, review insights, and return to your money with more confidence.
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
      </ScrollReveal>
    </main>
  );
}
