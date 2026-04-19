import { ScrollReveal } from "../components/scroll-reveal";
import Link from "next/link";

function HeroScene() {
  return (
    <div className="landing-scene landing-scene--hero" aria-hidden="true">
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

function StatementScene() {
  return (
    <div className="landing-visual" aria-hidden="true">
      <svg className="landing-visual__svg" viewBox="0 0 760 560" role="presentation" focusable="false">
        <defs>
          <linearGradient id="statementPaper" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#eef7f8" />
          </linearGradient>
          <linearGradient id="statementAccent" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#c7f2f5" />
            <stop offset="100%" stopColor="#0ca6b8" />
          </linearGradient>
        </defs>

        <rect x="78" y="84" width="252" height="336" rx="30" fill="rgba(255,255,255,0.7)" stroke="rgba(15,23,42,0.05)" />
        <rect x="112" y="116" width="184" height="20" rx="10" fill="rgba(18, 49, 61, 0.12)" />
        <rect x="112" y="150" width="124" height="12" rx="6" fill="rgba(18, 49, 61, 0.08)" />
        <rect x="112" y="182" width="164" height="126" rx="22" fill="url(#statementPaper)" stroke="rgba(15,23,42,0.06)" />
        <path d="M132 252H208" stroke="url(#statementAccent)" strokeWidth="10" strokeLinecap="round" />
        <path d="M132 228H254" stroke="url(#statementAccent)" strokeOpacity="0.6" strokeWidth="8" strokeLinecap="round" />
        <path d="M132 276H240" stroke="url(#statementAccent)" strokeOpacity="0.34" strokeWidth="8" strokeLinecap="round" />

        <rect x="300" y="116" width="304" height="332" rx="34" fill="rgba(255,255,255,0.84)" stroke="rgba(15,23,42,0.05)" />
        <rect x="336" y="152" width="120" height="12" rx="6" fill="rgba(18, 49, 61, 0.12)" />
        <rect x="336" y="182" width="198" height="86" rx="24" fill="rgba(3, 168, 192, 0.08)" />
        <circle cx="372" cy="225" r="20" fill="rgba(12, 166, 184, 0.16)" />
        <path d="M358 225h28M372 211v28" stroke="#0ca6b8" strokeWidth="4" strokeLinecap="round" />
        <rect x="336" y="292" width="154" height="12" rx="6" fill="rgba(18, 49, 61, 0.09)" />
        <rect x="336" y="318" width="184" height="12" rx="6" fill="rgba(18, 49, 61, 0.08)" />
        <rect x="336" y="344" width="136" height="12" rx="6" fill="rgba(18, 49, 61, 0.08)" />

        <g opacity="0.88">
          <rect x="548" y="140" width="84" height="168" rx="22" fill="rgba(255,255,255,0.78)" stroke="rgba(15,23,42,0.05)" />
          <rect x="568" y="160" width="44" height="10" rx="5" fill="rgba(18, 49, 61, 0.12)" />
          <rect x="568" y="190" width="40" height="10" rx="5" fill="rgba(18, 49, 61, 0.08)" />
          <rect x="568" y="220" width="32" height="10" rx="5" fill="rgba(18, 49, 61, 0.08)" />
          <path d="M570 252l14-18 12 10 14-24" fill="none" stroke="#0ca6b8" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </svg>
    </div>
  );
}

function InsightsScene() {
  return (
    <div className="landing-visual" aria-hidden="true">
      <svg className="landing-visual__svg" viewBox="0 0 760 560" role="presentation" focusable="false">
        <defs>
          <linearGradient id="insightBg" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#eef9fa" />
          </linearGradient>
          <linearGradient id="insightLine" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#9feaed" />
            <stop offset="100%" stopColor="#0ca6b8" />
          </linearGradient>
        </defs>

        <rect x="68" y="86" width="624" height="364" rx="38" fill="url(#insightBg)" stroke="rgba(15,23,42,0.05)" />
        <rect x="108" y="124" width="176" height="18" rx="9" fill="rgba(18, 49, 61, 0.12)" />
        <rect x="108" y="164" width="210" height="12" rx="6" fill="rgba(18, 49, 61, 0.08)" />
        <rect x="108" y="198" width="480" height="196" rx="28" fill="rgba(255,255,255,0.82)" stroke="rgba(15,23,42,0.05)" />
        <path d="M146 328C184 290 224 300 268 268C316 232 358 242 404 212C454 180 502 190 552 154" fill="none" stroke="url(#insightLine)" strokeWidth="14" strokeLinecap="round" />
        <circle cx="146" cy="328" r="7" fill="#0ca6b8" />
        <circle cx="268" cy="268" r="7" fill="#0ca6b8" />
        <circle cx="404" cy="212" r="7" fill="#0ca6b8" />
        <circle cx="552" cy="154" r="7" fill="#0ca6b8" />

        <g transform="translate(608 222)">
          <rect x="0" y="0" width="92" height="136" rx="24" fill="rgba(255,255,255,0.8)" stroke="rgba(15,23,42,0.05)" />
          <rect x="20" y="22" width="52" height="10" rx="5" fill="rgba(18, 49, 61, 0.12)" />
          <path d="M20 82h52M20 104h34" stroke="#0ca6b8" strokeWidth="8" strokeLinecap="round" />
          <circle cx="46" cy="58" r="18" fill="rgba(12,166,184,0.14)" />
          <path d="M46 46v24M34 58h24" stroke="#0ca6b8" strokeWidth="4" strokeLinecap="round" />
        </g>

        <g transform="translate(112 422)">
          <rect x="0" y="0" width="112" height="16" rx="8" fill="rgba(18, 49, 61, 0.1)" />
          <rect x="128" y="0" width="148" height="16" rx="8" fill="rgba(18, 49, 61, 0.08)" />
          <rect x="292" y="0" width="132" height="16" rx="8" fill="rgba(18, 49, 61, 0.08)" />
        </g>
      </svg>
    </div>
  );
}

function LifestyleScene() {
  return (
    <div className="landing-visual" aria-hidden="true">
      <svg className="landing-visual__svg" viewBox="0 0 760 520" role="presentation" focusable="false">
        <defs>
          <linearGradient id="lifeBg" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#fefefe" />
            <stop offset="100%" stopColor="#f2f7f8" />
          </linearGradient>
          <linearGradient id="lifeAccent" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#f6fcfd" />
            <stop offset="100%" stopColor="#c8f0f3" />
          </linearGradient>
        </defs>

        <rect x="70" y="64" width="620" height="348" rx="38" fill="url(#lifeBg)" stroke="rgba(15,23,42,0.05)" />
        <circle cx="520" cy="154" r="102" fill="rgba(3,168,192,0.08)" />
        <circle cx="558" cy="168" r="56" fill="rgba(12,166,184,0.12)" />

        <g transform="translate(176 126)">
          <path d="M92 44h120l18 198H74L92 44Z" fill="rgba(255,255,255,0.86)" stroke="rgba(15,23,42,0.05)" />
          <rect x="110" y="66" width="86" height="10" rx="5" fill="rgba(18,49,61,0.12)" />
          <rect x="110" y="92" width="118" height="12" rx="6" fill="rgba(18,49,61,0.08)" />
          <rect x="110" y="122" width="104" height="12" rx="6" fill="rgba(18,49,61,0.08)" />
          <rect x="110" y="154" width="80" height="48" rx="18" fill="url(#lifeAccent)" />
          <path d="M128 182h44" stroke="#0ca6b8" strokeWidth="8" strokeLinecap="round" />
          <path d="M158 170v24" stroke="#0ca6b8" strokeWidth="8" strokeLinecap="round" />
        </g>

        <g transform="translate(330 168)">
          <rect x="0" y="0" width="164" height="154" rx="28" fill="rgba(255,255,255,0.92)" stroke="rgba(15,23,42,0.05)" />
          <circle cx="50" cy="54" r="18" fill="rgba(12,166,184,0.14)" />
          <circle cx="108" cy="54" r="18" fill="rgba(12,166,184,0.1)" />
          <path d="M32 102l22-16 14 8 18-20 18 12 18-10" fill="none" stroke="#0ca6b8" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="28" y="118" width="108" height="10" rx="5" fill="rgba(18, 49, 61, 0.08)" />
        </g>
      </svg>
    </div>
  );
}

function VisualGallery() {
  return (
    <div className="landing-gallery" aria-hidden="true">
      <div className="landing-gallery__layout">
        <figure className="landing-gallery__frame landing-gallery__frame--hero">
          <img src="/landing-previews/cashflow-line.svg" alt="" />
        </figure>

        <div className="landing-gallery__stack">
          <figure className="landing-gallery__frame">
            <img src="/landing-previews/category-mix.svg" alt="" />
          </figure>

          <figure className="landing-gallery__frame">
            <img src="/landing-previews/top-sources.svg" alt="" />
          </figure>
        </div>
      </div>

      <figure className="landing-gallery__frame landing-gallery__frame--wide">
        <img src="/landing-previews/bills-payments.svg" alt="" />
      </figure>
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

        <HeroScene />
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

      <ScrollReveal as="section" className="landing-band">
        <div className="landing-band__copy">
          <p className="eyebrow">Upload statements</p>
          <h2>An easier way to see your whole financial picture.</h2>
          <p>
            Upload statements of account and let Clover turn the data into a cleaner overview, so you do less manual sorting and more actual understanding.
          </p>
        </div>
        <StatementScene />
      </ScrollReveal>

      <ScrollReveal as="section" className="landing-band landing-band--reverse">
        <div className="landing-band__copy">
          <p className="eyebrow">Reports and AI</p>
          <h2>Find insights faster with reports that explain what matters.</h2>
          <p>
            Clover helps people analyze their finances with clear reports and AI-guided insights, making it easier to spot patterns and make better decisions.
          </p>
        </div>
        <InsightsScene />
      </ScrollReveal>

      <ScrollReveal as="section" className="landing-band">
        <div className="landing-band__copy">
          <p className="eyebrow">A smarter overview</p>
          <h2>Built for people who want a calmer, more confident view of money.</h2>
          <p>
            Clover keeps the experience friendly and professional, so the product feels supportive instead of overwhelming.
          </p>
        </div>
        <LifestyleScene />
      </ScrollReveal>

      <ScrollReveal as="section" className="landing-cta">
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
      </ScrollReveal>
    </main>
  );
}
