"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { getHelpSectionHref, getPopularHelpSearchPhrases, helpSections, type HelpSection } from "@/lib/help-center";

type HelpCenterProps = {
  returnTo?: string | null;
};

function HelpIcon({ name }: { name: HelpSection["icon"] }) {
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
    case "spark":
      return (
        <svg {...common}>
          <path d="M12 3.5l2.2 5.3L19.5 11l-5.3 2.2L12 18.5l-2.2-5.3L4.5 11l5.3-2.2L12 3.5Z" />
        </svg>
      );
    case "play":
      return (
        <svg {...common}>
          <path d="M8.5 6.8v10.4L17 12 8.5 6.8Z" />
        </svg>
      );
    case "wallet":
      return (
        <svg {...common}>
          <path d="M4.5 8.5h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-14a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z" />
          <path d="M17 12h3.5" />
          <path d="M5 8.5V7a2 2 0 0 1 2-2h10" />
        </svg>
      );
    case "inbox":
      return (
        <svg {...common}>
          <path d="M5 7h14l-1.4 7H14l-1.2 2.2H11.2L10 14H6.4L5 7Z" />
          <path d="M8 7V5.8A1.8 1.8 0 0 1 9.8 4h4.4A1.8 1.8 0 0 1 16 5.8V7" />
        </svg>
      );
    case "pricing":
      return (
        <svg {...common}>
          <path d="M12 3.5v17" />
          <path d="M16.5 7.5c0-1.9-2-3-4.5-3s-4.5 1-4.5 2.8S9 10.6 12 11.2s4.5 1.9 4.5 3.7-2 3.6-4.5 3.6-4.5-1-4.5-3" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 3.5 18.5 6v5.7c0 3.8-2.7 7.1-6.5 8.8-3.8-1.7-6.5-5-6.5-8.8V6L12 3.5Z" />
          <path d="M9.5 12.1 11 13.6l3.7-3.8" />
        </svg>
      );
    case "storage":
      return (
        <svg {...common}>
          <rect x="4" y="4.5" width="16" height="5" rx="2.2" />
          <rect x="4" y="10.5" width="16" height="5" rx="2.2" />
          <rect x="4" y="16.5" width="16" height="3" rx="1.5" />
          <path d="M7 7h.01" />
          <path d="M7 13h.01" />
        </svg>
      );
    case "wrench":
      return (
        <svg {...common}>
          <path d="M14.5 5.5a4.5 4.5 0 0 0-6.4 5.1L4.5 14.2l5.3 5.3 3.6-3.6a4.5 4.5 0 0 0 5.1-6.4l-3 3-2.6-2.6 3-3Z" />
        </svg>
      );
  }
}

function HelpHeroArt() {
  return (
    <div className="help-hero__art" aria-hidden="true">
      <div className="help-hero__orb help-hero__orb--a" />
      <div className="help-hero__orb help-hero__orb--b" />
      <div className="help-hero__card help-hero__card--top">
        <span className="help-hero__card-label">Find answers fast</span>
        <strong>Search Clover help</strong>
        <p>Pick a section, open the guide, and keep moving.</p>
      </div>
      <div className="help-hero__card help-hero__card--left">
        <span>Setup</span>
        <strong>Get started quickly</strong>
      </div>
      <div className="help-hero__card help-hero__card--right">
        <span>Safety</span>
        <strong>Security and retention</strong>
      </div>
      <svg className="help-hero__illustration" viewBox="0 0 560 420" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="helpArtGlow" x1="80" y1="0" x2="520" y2="420" gradientUnits="userSpaceOnUse">
            <stop stopColor="#03A8C0" stopOpacity="0.28" />
            <stop offset="1" stopColor="#68DCB1" stopOpacity="0.12" />
          </linearGradient>
          <linearGradient id="helpArtFrame" x1="160" y1="40" x2="400" y2="360" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFFFFF" stopOpacity="0.96" />
            <stop offset="1" stopColor="#F2FAFB" stopOpacity="0.96" />
          </linearGradient>
        </defs>
        <path d="M106 314C58 252 70 168 132 123C181 87 252 69 321 76C409 85 471 129 503 195C535 262 514 340 447 378C350 433 168 399 106 314Z" fill="url(#helpArtGlow)" />
        <rect x="126" y="68" width="276" height="224" rx="34" fill="url(#helpArtFrame)" stroke="#CFE8ED" />
        <rect x="154" y="98" width="110" height="28" rx="14" fill="#E5F8FA" />
        <rect x="154" y="142" width="188" height="16" rx="8" fill="#DCECEF" />
        <rect x="154" y="168" width="158" height="16" rx="8" fill="#E4EEF1" />
        <rect x="154" y="194" width="132" height="16" rx="8" fill="#DCECEF" />
        <rect x="154" y="230" width="82" height="24" rx="12" fill="#03A8C0" fillOpacity="0.18" />
        <rect x="246" y="230" width="96" height="24" rx="12" fill="#68DCB1" fillOpacity="0.2" />
        <circle cx="404" cy="118" r="36" fill="#FFFFFF" stroke="#CFE8ED" />
        <circle cx="404" cy="118" r="14" stroke="#03A8C0" strokeWidth="8" />
        <path d="m414 128 14 14" stroke="#03A8C0" strokeWidth="8" strokeLinecap="round" />
        <rect x="182" y="320" width="210" height="48" rx="24" fill="#FFFFFF" stroke="#D7E7EA" />
        <path d="M210 344h78" stroke="#03A8C0" strokeWidth="8" strokeLinecap="round" />
        <path d="M302 344h62" stroke="#68DCB1" strokeWidth="8" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function matchesQuery(section: HelpSection, query: string) {
  if (!query) {
    return true;
  }

  const haystack = [
    section.eyebrow,
    section.title,
    section.summary,
    ...section.keywords,
    ...section.highlights,
    ...section.questions.flatMap((entry) => [entry.question, entry.answer]),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

export function HelpCenter({ returnTo }: HelpCenterProps) {
  const [query, setQuery] = useState("");

  const normalizedQuery = query.trim().toLowerCase();

  const filteredSections = useMemo(() => {
    if (!normalizedQuery) {
      return helpSections;
    }

    return helpSections.filter((section) => matchesQuery(section, normalizedQuery));
  }, [normalizedQuery]);

  const heroBackHref = returnTo ?? "/";
  const heroBackLabel = returnTo ? "Back to account" : "Back to home";
  const heroBackNote = returnTo ? "Return to your account area without leaving Clover." : "Go back to the landing page.";
  const popularSearches = useMemo(() => getPopularHelpSearchPhrases(8), []);

  return (
    <main className="help-page">
      <div className="help-page__inner">
        <nav className="help-page__nav" aria-label="Help page navigation">
          <Link className="landing-brand" href="/" aria-label="Clover home" prefetch={false}>
            <img className="landing-brand__mark" src="/clover-mark.svg" alt="" aria-hidden="true" />
            <img className="landing-brand__wordmark" src="/clover-name-teal.svg" alt="Clover" />
          </Link>
          <div className="help-page__nav-links">
            <Link className="help-page__nav-link" href={heroBackHref} prefetch={false}>
              {heroBackLabel}
            </Link>
            <Link className="help-page__nav-link" href="/pricing" prefetch={false}>
              Pricing
            </Link>
            <Link className="help-page__nav-link" href="/privacy-policy" prefetch={false}>
              Privacy
            </Link>
          </div>
        </nav>

        <section className="help-hero glass">
          <div className="help-hero__copy">
            <span className="pill pill-accent">Help center</span>
            <h1>Simple answers for every part of Clover.</h1>
            <p className="help-hero__lede">
              Search for what you need, then open a focused guide for setup, features, accounts, pricing, security, or data handling.
            </p>

            <label className="help-search" htmlFor="help-search">
              <span className="sr-only">Search help</span>
              <input
                id="help-search"
                type="search"
                placeholder="Search help topics"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>

            <div className="help-hero__actions">
              <Link className="button button-primary button-pill" href={heroBackHref} prefetch={false}>
                {heroBackLabel}
              </Link>
              <Link className="button button-secondary button-pill" href="/sign-in" prefetch={false}>
                Log in
              </Link>
              <Link className="button button-secondary button-pill" href="/sign-up" prefetch={false}>
                Sign up
              </Link>
            </div>

            <p className="help-hero__note">{heroBackNote}</p>
          </div>

          <HelpHeroArt />
        </section>

        <section className="help-intro">
          <div>
            <p className="eyebrow">Browse by topic</p>
            <h2>Choose the guide that fits what you are doing right now.</h2>
          </div>
          <p>
            Each section opens its own page with a quick summary, common questions, and the next useful links so users can keep moving without
            hunting around.
          </p>
        </section>

        <section className="help-search-strip glass" aria-label="Popular searches">
          <div className="help-search-strip__copy">
            <p className="eyebrow">Popular searches</p>
            <h2>Common help searches from Clover users</h2>
          </div>
          <div className="help-search-strip__chips">
            {popularSearches.map((phrase) => (
              <button key={phrase} className="help-search-strip__chip" type="button" onClick={() => setQuery(phrase)}>
                {phrase}
              </button>
            ))}
          </div>
        </section>

        <section className="help-grid" aria-label="Help topics">
          {filteredSections.map((section) => (
            <Link key={section.slug} className={`help-card help-card--${section.accent} glass`} href={getHelpSectionHref(section.slug, returnTo)} prefetch={false}>
              <div className="help-card__icon" aria-hidden="true">
                <HelpIcon name={section.icon} />
              </div>
              <div className="help-card__copy">
                <p className="help-card__eyebrow">{section.eyebrow}</p>
                <h3>{section.title}</h3>
                <p>{section.summary}</p>
                <div className="help-card__highlights">
                  {section.highlights.slice(0, 2).map((highlight) => (
                    <span key={highlight}>{highlight}</span>
                  ))}
                </div>
                <div className="help-card__article-count">
                  {section.articles.length.toLocaleString()} article{section.articles.length === 1 ? "" : "s"}
                </div>
              </div>
            </Link>
          ))}
        </section>

        {filteredSections.length === 0 ? (
          <section className="help-empty glass">
            <h3>No matches yet.</h3>
            <p>Try a broader search like “setup”, “billing”, “privacy”, or “security”.</p>
            <div className="help-empty__actions">
              {helpSections.slice(0, 3).map((section) => (
                <Link key={section.slug} className="button button-secondary button-small" href={getHelpSectionHref(section.slug, returnTo)} prefetch={false}>
                  {section.title}
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className="help-quick-links">
          <div className="help-quick-links__copy">
            <p className="eyebrow">Quick routes</p>
            <h2>Useful links when you already know the next step.</h2>
          </div>
          <div className="help-quick-links__list">
            <Link href="/pricing" prefetch={false}>
              Pricing
            </Link>
            <Link href="/settings" prefetch={false}>
              Settings
            </Link>
            <Link href="/privacy-policy" prefetch={false}>
              Privacy policy
            </Link>
            <Link href="/terms-of-service" prefetch={false}>
              Terms of service
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
