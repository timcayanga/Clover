"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { getHelpSectionHref, getHelpSectionImageSrc, helpSections, type HelpSection } from "@/lib/help-center";

type HelpCenterProps = {
  returnTo?: string | null;
};

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

  const filteredSections = useMemo(() => {
    if (!normalizedQuery) {
      return helpSections;
    }

    return helpSections.filter((section) => matchesQuery(section, normalizedQuery));
  }, [normalizedQuery]);

  const heroBackHref = returnTo ?? "/";
  return (
    <main className="help-page">
      <div className="help-page__inner">
        <nav className="help-page__nav" aria-label="Help page navigation">
          <Link className="landing-brand" href={heroBackHref} aria-label="Clover home" prefetch={false}>
            <img className="landing-brand__mark" src="/clover-mark.svg" alt="" aria-hidden="true" />
            <img className="landing-brand__wordmark" src="/clover-name-teal.svg" alt="Clover" />
          </Link>
        </nav>

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

        <section className="help-grid" aria-label="Help topics">
          {filteredSections.map((section) => (
            <Link key={section.slug} className={`help-card help-card--${section.accent} glass`} href={getHelpSectionHref(section.slug, returnTo)} prefetch={false}>
              <img
                className="help-card__image"
                src={getHelpSectionImageSrc(section.slug)}
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
              />
              <h3>{section.title}</h3>
            </Link>
          ))}
        </section>

      </div>
    </main>
  );
}
