import Link from "next/link";
import { ScrollReveal } from "@/components/scroll-reveal";

function LandingScene() {
  return (
    <div className="landing-scene" aria-hidden="true">
      <div className="landing-scene__glow landing-scene__glow--left" />
      <div className="landing-scene__glow landing-scene__glow--right" />

      <div className="landing-scene__frame">
        <svg className="landing-scene__art" viewBox="0 0 720 680" role="presentation" focusable="false">
          <defs>
            <linearGradient id="heroCardGradient" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#e9fbfd" />
            </linearGradient>
            <linearGradient id="heroAccentGradient" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#7be5eb" />
              <stop offset="100%" stopColor="#0ca6b8" />
            </linearGradient>
            <linearGradient id="heroShadowGradient" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="rgba(9, 30, 42, 0.18)" />
              <stop offset="100%" stopColor="rgba(9, 30, 42, 0.02)" />
            </linearGradient>
          </defs>

          <ellipse cx="366" cy="578" rx="176" ry="38" fill="rgba(9, 30, 42, 0.16)" />

          <g transform="translate(104 110) rotate(-7 256 210)">
            <path
              d="M74 18H408c27.614 0 50 22.386 50 50v220c0 27.614-22.386 50-50 50H74c-27.614 0-50-22.386-50-50V68c0-27.614 22.386-50 50-50Z"
              fill="url(#heroShadowGradient)"
            />
            <path
              d="M66 8H400c27.614 0 50 22.386 50 50v220c0 27.614-22.386 50-50 50H66c-27.614 0-50-22.386-50-50V58c0-27.614 22.386-50 50-50Z"
              fill="url(#heroCardGradient)"
              stroke="rgba(5, 126, 160, 0.16)"
              strokeWidth="2"
            />
            <path
              d="M98 58h108c13.255 0 24 10.745 24 24v8c0 13.255-10.745 24-24 24H98c-13.255 0-24-10.745-24-24v-8c0-13.255 10.745-24 24-24Z"
              fill="rgba(3, 168, 192, 0.12)"
            />
            <circle cx="126" cy="98" r="13" fill="url(#heroAccentGradient)" />
            <path d="M118 98h16M126 90v16" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" />

            <text x="158" y="90" fill="#12313d" fontSize="22" fontWeight="700" fontFamily="inherit">
              Clover
            </text>
            <text x="158" y="113" fill="#5d7480" fontSize="13" fontWeight="500" fontFamily="inherit">
              Visual money workspace
            </text>

            <g transform="translate(98 150)">
              <rect x="0" y="0" width="300" height="132" rx="22" fill="rgba(255,255,255,0.8)" stroke="rgba(15,23,42,0.06)" />
              <path d="M24 92C56 72 76 82 103 60C131 38 163 36 198 48C230 59 251 44 276 28" fill="none" stroke="#12a7b8" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M24 92C56 72 76 82 103 60C131 38 163 36 198 48C230 59 251 44 276 28" fill="none" stroke="#e0fbfd" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="24" cy="92" r="7" fill="#12a7b8" />
              <circle cx="103" cy="60" r="7" fill="#12a7b8" />
              <circle cx="198" cy="48" r="7" fill="#12a7b8" />
              <circle cx="276" cy="28" r="7" fill="#12a7b8" />
              <rect x="24" y="104" width="72" height="10" rx="5" fill="rgba(18, 49, 61, 0.15)" />
              <rect x="24" y="20" width="82" height="12" rx="6" fill="rgba(18, 49, 61, 0.12)" />
              <rect x="220" y="18" width="54" height="20" rx="10" fill="rgba(3, 168, 192, 0.14)" />
            </g>

            <g transform="translate(78 294)">
              <rect x="0" y="0" width="136" height="86" rx="22" fill="rgba(3, 168, 192, 0.16)" />
              <rect x="18" y="18" width="100" height="10" rx="5" fill="rgba(18, 49, 61, 0.16)" />
              <rect x="18" y="42" width="74" height="14" rx="7" fill="#0ca6b8" />
              <circle cx="108" cy="48" r="14" fill="rgba(255,255,255,0.8)" />
              <path d="M102 48h12M108 42v12" stroke="#0ca6b8" strokeWidth="3" strokeLinecap="round" />
            </g>

            <g transform="translate(246 300)">
              <rect x="0" y="0" width="194" height="108" rx="24" fill="rgba(255,255,255,0.94)" stroke="rgba(5, 126, 160, 0.14)" />
              <rect x="20" y="18" width="66" height="11" rx="5.5" fill="rgba(18, 49, 61, 0.16)" />
              <rect x="20" y="48" width="154" height="16" rx="8" fill="rgba(12, 166, 184, 0.14)" />
              <rect x="20" y="74" width="104" height="12" rx="6" fill="rgba(18, 49, 61, 0.12)" />
              <path d="M24 80l18-12 16 5 20-18 22 12 22-8 18 10" fill="none" stroke="#12a7b8" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          </g>

          <g transform="translate(504 118) rotate(9 78 108)">
            <path
              d="M22 22h136c14.36 0 26 11.64 26 26v138c0 14.36-11.64 26-26 26H22c-14.36 0-26-11.64-26-26V48c0-14.36 11.64-26 26-26Z"
              fill="rgba(255,255,255,0.78)"
              stroke="rgba(5, 126, 160, 0.14)"
            />
            <path d="M18 14h136c14.36 0 26 11.64 26 26v138c0 14.36-11.64 26-26 26H18c-14.36 0-26-11.64-26-26V40c0-14.36 11.64-26 26-26Z" fill="url(#heroCardGradient)" stroke="rgba(15,23,42,0.05)" />
            <rect x="20" y="28" width="112" height="14" rx="7" fill="rgba(18, 49, 61, 0.14)" />
            <rect x="20" y="58" width="76" height="12" rx="6" fill="rgba(18, 49, 61, 0.1)" />
            <path d="M32 150l24-28 18 14 18-36 22 20 34-42" fill="none" stroke="url(#heroAccentGradient)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="32" cy="150" r="6" fill="#0ca6b8" />
            <circle cx="56" cy="122" r="6" fill="#0ca6b8" />
            <circle cx="74" cy="136" r="6" fill="#0ca6b8" />
            <circle cx="92" cy="100" r="6" fill="#0ca6b8" />
            <circle cx="114" cy="120" r="6" fill="#0ca6b8" />
            <circle cx="148" cy="78" r="6" fill="#0ca6b8" />
          </g>

          <g transform="translate(458 394) rotate(-11 116 76)">
            <path
              d="M30 22h176c16.569 0 30 13.431 30 30v48c0 16.569-13.431 30-30 30H30C13.431 130 0 116.569 0 100V52c0-16.569 13.431-30 30-30Z"
              fill="rgba(255,255,255,0.92)"
              stroke="rgba(5, 126, 160, 0.14)"
            />
            <rect x="18" y="22" width="72" height="12" rx="6" fill="rgba(18, 49, 61, 0.12)" />
            <rect x="18" y="48" width="138" height="10" rx="5" fill="rgba(18, 49, 61, 0.08)" />
            <rect x="18" y="66" width="104" height="10" rx="5" fill="rgba(18, 49, 61, 0.08)" />
            <path d="M176 36c16 8 22 30 14 48-8 18-28 30-50 28 6-8 9-18 8-28-2-20 8-37 28-48Z" fill="rgba(3, 168, 192, 0.14)" />
            <circle cx="188" cy="60" r="14" fill="url(#heroAccentGradient)" />
            <path d="M188 52v16M180 60h16" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" />
          </g>
        </svg>
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

      <ScrollReveal as="section" className="landing-hero" delay={0}>
        <div className="landing-hero__copy">
          <span className="pill pill-accent">Private money workspace</span>
          <h1>Turn money chaos into a calm visual system.</h1>
          <p className="landing-hero__lede">
            Clover brings transactions, imports, and insights into one polished workspace so you can see the story, trust the numbers, and move faster.
          </p>

          <div className="landing-hero__actions">
            <Link className="button button-primary button-pill" href="/sign-up">
              Get started
            </Link>
            <Link className="button button-secondary button-pill" href="/sign-in">
              Log in
            </Link>
          </div>

          <div className="landing-hero__trust">
            <div>
              <strong>Visual first</strong>
              <span>Built to make money data easier to scan</span>
            </div>
            <div>
              <strong>Fast to start</strong>
              <span>Sign up in a few minutes and jump in</span>
            </div>
            <div>
              <strong>Made to guide</strong>
              <span>Clear paths from review to action</span>
            </div>
          </div>
        </div>

        <LandingScene />
      </ScrollReveal>

      <ScrollReveal as="section" className="landing-benefits" delay={80}>
        <article className="landing-card glass">
          <p className="eyebrow">Understand</p>
          <h2>See the shape of your money at a glance.</h2>
          <p>
            Clover organizes your transactions, categories, and trends into a visual system that makes the important stuff stand out immediately.
          </p>
        </article>
        <article className="landing-card glass">
          <p className="eyebrow">Review</p>
          <h2>Spot issues before they turn into habits.</h2>
          <p>
            Clean visuals and source-aware workflows make it easier to catch duplicates, odd spending, and missing details without digging.
          </p>
        </article>
        <article className="landing-card glass">
          <p className="eyebrow">Act</p>
          <h2>Move from insight to action with less friction.</h2>
          <p>
            When the next step is obvious, it is easier to save, adjust, and keep your finances moving in the right direction.
          </p>
        </article>
      </ScrollReveal>

      <ScrollReveal as="section" className="landing-showcase" delay={120}>
        <article className="landing-showcase__copy glass">
          <p className="eyebrow">Designed to feel premium</p>
          <h2>A product preview that feels deliberate, not decorative.</h2>
          <p>
            Instead of relying on flat icons, Clover uses layered cards, soft depth, and illustration-driven scenes to make the experience feel tangible at first glance.
          </p>
          <div className="landing-stat-row">
            <div className="landing-stat">
              <strong>1</strong>
              <span>place to start</span>
            </div>
            <div className="landing-stat">
              <strong>2</strong>
              <span>clear actions</span>
            </div>
            <div className="landing-stat">
              <strong>3</strong>
              <span>benefits up front</span>
            </div>
          </div>
        </article>

        <article className="landing-showcase__panel glass">
          <div className="landing-mini-screen">
            <div className="landing-mini-screen__top">
              <span />
              <span />
              <span />
            </div>
            <div className="landing-mini-screen__body">
              <div className="landing-mini-card landing-mini-card--large">
                <strong>Net position</strong>
                <span>Clear summary of what is left after expenses</span>
              </div>
              <div className="landing-mini-card landing-mini-card--accent">
                <strong>Pending review</strong>
                <span>Fast cue for transactions that need attention</span>
              </div>
              <div className="landing-mini-card landing-mini-card--chart">
                <div className="landing-mini-bars" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </div>
          </div>
        </article>
      </ScrollReveal>

      <ScrollReveal as="section" className="landing-cta glass" delay={160}>
        <div>
          <p className="eyebrow">Ready to explore Clover?</p>
          <h2>Start a new account or pick up right where you left off.</h2>
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
