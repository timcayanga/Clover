import Link from "next/link";

function HeroScene() {
  return (
    <div className="landing-scene" aria-hidden="true">
      <div className="landing-scene__halo landing-scene__halo--left" />
      <div className="landing-scene__halo landing-scene__halo--right" />
      <svg className="landing-scene__chart" viewBox="0 0 740 560" role="presentation" focusable="false">
        <defs>
          <linearGradient id="landingLine" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#9feaed" />
            <stop offset="100%" stopColor="#0ca6b8" />
          </linearGradient>
          <linearGradient id="landingFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(12, 166, 184, 0.2)" />
            <stop offset="100%" stopColor="rgba(12, 166, 184, 0.02)" />
          </linearGradient>
        </defs>

        <rect x="82" y="110" width="576" height="278" rx="38" fill="rgba(255,255,255,0.5)" stroke="rgba(15,23,42,0.05)" />
        <path d="M136 280C176 254 214 258 252 228C292 196 334 198 376 176C418 154 458 164 506 138C548 116 592 118 616 100" fill="none" stroke="url(#landingLine)" strokeWidth="14" strokeLinecap="round" />
        <path d="M136 280C176 254 214 258 252 228C292 196 334 198 376 176C418 154 458 164 506 138C548 116 592 118 616 100V388H136Z" fill="url(#landingFill)" />
        <circle cx="136" cy="280" r="7" fill="#0ca6b8" />
        <circle cx="252" cy="228" r="7" fill="#0ca6b8" />
        <circle cx="376" cy="176" r="7" fill="#0ca6b8" />
        <circle cx="506" cy="138" r="7" fill="#0ca6b8" />
        <circle cx="616" cy="100" r="7" fill="#0ca6b8" />

        <rect x="146" y="136" width="94" height="12" rx="6" fill="rgba(18, 49, 61, 0.1)" />
        <rect x="516" y="136" width="76" height="22" rx="11" fill="rgba(3, 168, 192, 0.14)" />
        <rect x="146" y="332" width="70" height="10" rx="5" fill="rgba(18, 49, 61, 0.12)" />
      </svg>
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="landing-page">
      <header className="landing-nav landing-nav--sticky">
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
      </header>

      <section className="landing-hero">
        <div className="landing-hero__copy">
          <span className="pill pill-accent">Money clarity, made calm</span>
          <h1>A quieter way to see your money.</h1>
          <p className="landing-hero__lede">
            Clover gives you a clean, visual home for your transactions, imports, and insights so you can understand what is happening and act without friction.
          </p>

          <div className="landing-hero__actions">
            <Link className="button button-primary button-pill" href="/sign-up">
              Get started
            </Link>
            <Link className="button button-secondary button-pill" href="/sign-in">
              Log in
            </Link>
          </div>

          <p className="landing-hero__note">Private, simple, and designed to help you feel in control.</p>
        </div>

        <HeroScene />
      </section>

      <section className="landing-section">
        <p className="eyebrow">Understand</p>
        <h2>See the important numbers without digging.</h2>
        <p>Transactions, trends, and categories are organized to feel immediate, not overwhelming.</p>
      </section>

      <section className="landing-section">
        <p className="eyebrow">Review</p>
        <h2>Notice what needs attention faster.</h2>
        <p>Import and source details stay visible so cleanup feels calmer and quicker.</p>
      </section>

      <section className="landing-section">
        <p className="eyebrow">Act</p>
        <h2>Move from insight to action with less effort.</h2>
        <p>When the next step is obvious, it is easier to stay on top of your finances.</p>
      </section>

      <section className="landing-quote">
        <div className="landing-quote__mark">“</div>
        <p>
          A simple workspace that helps you breathe, see clearly, and make the next money decision with confidence.
        </p>
      </section>

      <section className="landing-cta">
        <div>
          <p className="eyebrow">Ready when you are</p>
          <h2>Start fresh or log back in.</h2>
        </div>
        <div className="landing-cta__actions">
          <Link className="button button-primary button-pill" href="/sign-up">
            Sign up
          </Link>
          <Link className="button button-secondary button-pill" href="/sign-in">
            Log in
          </Link>
        </div>
      </section>
    </main>
  );
}
