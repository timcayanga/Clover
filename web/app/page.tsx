import Link from "next/link";

function HeroScene() {
  return (
    <div className="landing-scene" aria-hidden="true">
      <div className="landing-scene__halo landing-scene__halo--left" />
      <div className="landing-scene__halo landing-scene__halo--right" />

      <div className="landing-scene__card">
        <div className="landing-scene__card-top">
          <span />
          <span />
          <span />
        </div>

        <div className="landing-scene__window">
          <div className="landing-scene__window-copy">
            <span className="landing-scene__label">Today</span>
            <strong>Calm overview</strong>
            <p>Everything important in one place, without the noise.</p>
          </div>

          <svg className="landing-scene__chart" viewBox="0 0 420 260" role="presentation" focusable="false">
            <defs>
              <linearGradient id="landingChart" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#8fe6ea" />
                <stop offset="100%" stopColor="#0ca6b8" />
              </linearGradient>
              <linearGradient id="landingChartSoft" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="rgba(12, 166, 184, 0.22)" />
                <stop offset="100%" stopColor="rgba(12, 166, 184, 0.02)" />
              </linearGradient>
            </defs>

            <rect x="28" y="34" width="364" height="184" rx="28" fill="rgba(255,255,255,0.82)" stroke="rgba(15,23,42,0.06)" />
            <path d="M60 164C88 146 114 148 145 130C178 110 206 116 240 96C272 78 301 84 334 64" fill="none" stroke="url(#landingChart)" strokeWidth="10" strokeLinecap="round" />
            <path d="M60 164C88 146 114 148 145 130C178 110 206 116 240 96C272 78 301 84 334 64V206H60Z" fill="url(#landingChartSoft)" />
            <circle cx="60" cy="164" r="6" fill="#0ca6b8" />
            <circle cx="145" cy="130" r="6" fill="#0ca6b8" />
            <circle cx="240" cy="96" r="6" fill="#0ca6b8" />
            <circle cx="334" cy="64" r="6" fill="#0ca6b8" />

            <rect x="60" y="184" width="70" height="10" rx="5" fill="rgba(18, 49, 61, 0.12)" />
            <rect x="60" y="54" width="92" height="12" rx="6" fill="rgba(18, 49, 61, 0.1)" />
            <rect x="290" y="54" width="66" height="20" rx="10" fill="rgba(3, 168, 192, 0.14)" />
          </svg>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="landing-page">
      <header className="landing-nav">
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

      <section className="landing-benefits">
        <article className="landing-benefit">
          <p className="eyebrow">Understand</p>
          <h2>See the important numbers without digging.</h2>
          <p>Transactions, trends, and categories are organized to feel immediate, not overwhelming.</p>
        </article>
        <article className="landing-benefit">
          <p className="eyebrow">Review</p>
          <h2>Notice what needs attention faster.</h2>
          <p>Import and source details stay visible so cleanup feels calmer and quicker.</p>
        </article>
        <article className="landing-benefit">
          <p className="eyebrow">Act</p>
          <h2>Move from insight to action with less effort.</h2>
          <p>When the next step is obvious, it is easier to stay on top of your finances.</p>
        </article>
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
