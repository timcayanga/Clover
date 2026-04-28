"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { getHelpSearchResults, getHelpSectionHref, helpSections, type HelpSection } from "@/lib/help-center";

type HelpCenterProps = {
  returnTo?: string | null;
};

function HelpIcon({ name }: { name: HelpSection["icon"] }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "rgba(255, 255, 255, 0.98)",
    strokeWidth: 1.9,
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
    ...section.searchPhrases,
    ...section.questions.flatMap((entry) => [entry.question, entry.answer]),
    ...section.articles.flatMap((article) => [
      article.title,
      article.summary,
      ...article.keywords,
      ...article.steps,
      ...article.questions.flatMap((question) => [question.question, question.answer]),
    ]),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

export function HelpCenter({ returnTo }: HelpCenterProps) {
  const [query, setQuery] = useState("");

  const normalizedQuery = query.trim().toLowerCase();

  const searchResults = useMemo(() => getHelpSearchResults(normalizedQuery, 6), [normalizedQuery]);
  const filteredSections = useMemo(() => {
    if (!normalizedQuery) {
      return helpSections;
    }

    return helpSections.filter((section) => matchesQuery(section, normalizedQuery));
  }, [normalizedQuery]);

  const heroBackHref = returnTo ?? "/";
  const heroBackLabel = returnTo ? "Back to account" : "Back to home";
  const heroBackNote = returnTo ? "Return to your account area without leaving Clover." : "Go back to the landing page.";

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

        <section className="help-hero help-hero--simple glass">
          <div className="help-hero__copy">
            <span className="pill pill-accent">Help center</span>
            <h1>Simple answers for every part of Clover.</h1>

            <label className="help-search help-search--hero" htmlFor="help-search">
              <span className="sr-only">Search help</span>
              <input
                id="help-search"
                type="search"
                placeholder="Search Clover help"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>

            <div className="help-hero__actions help-hero__actions--simple">
              <Link className="button button-primary button-pill" href={heroBackHref} prefetch={false}>
                {heroBackLabel}
              </Link>
              <Link className="button button-secondary button-pill" href="/pricing" prefetch={false}>
                Pricing
              </Link>
              <Link className="button button-secondary button-pill" href="/privacy-policy" prefetch={false}>
                Privacy
              </Link>
            </div>

            <p className="help-hero__note">{heroBackNote}</p>
          </div>
        </section>

        {normalizedQuery ? (
          <section className="help-search-results glass" aria-label="Matching pages">
            <div className="help-search-results__head">
              <p className="eyebrow">Matching pages</p>
              <h2>Results for “{query.trim()}”</h2>
            </div>

            {searchResults.length > 0 ? (
              <div className="help-search-results__list">
                {searchResults.map((result) => (
                  <Link key={`${result.kind}-${result.sectionSlug}-${result.articleSlug ?? "section"}`} className="help-search-result" href={result.href} prefetch={false}>
                    <span className="help-search-result__type">{result.kind === "article" ? "Article" : "Section"}</span>
                    <strong>{result.title}</strong>
                    <span>{result.sectionTitle}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="help-search-results__empty">Try a broader phrase like setup, import, pricing, security, or delete account.</p>
            )}
          </section>
        ) : null}

        <section className="help-grid" aria-label="Help topics">
          {filteredSections.map((section) => (
            <Link key={section.slug} className={`help-card help-card--${section.accent} glass`} href={getHelpSectionHref(section.slug, returnTo)} prefetch={false}>
              <div className="help-card__icon" aria-hidden="true">
                <HelpIcon name={section.icon} />
              </div>
              <h3>{section.title}</h3>
            </Link>
          ))}
        </section>

        {!normalizedQuery && filteredSections.length === 0 ? (
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

      </div>
    </main>
  );
}
