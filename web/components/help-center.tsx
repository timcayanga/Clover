"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { LandingNav } from "@/components/landing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { getHelpSectionHref, getHelpSectionImageSrc, publicHelpSections, type HelpSection } from "@/lib/help-center";
import type { PublicAccountState } from "@/lib/public-account-state";

type HelpCenterProps = {
  returnTo?: string | null;
  accountState?: PublicAccountState | null;
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

export function HelpCenter({ returnTo, accountState }: HelpCenterProps) {
  const [query, setQuery] = useState("");

  const normalizedQuery = query.trim().toLowerCase();

  const filteredSections = useMemo(() => {
    if (!normalizedQuery) {
      return publicHelpSections;
    }

    return publicHelpSections.filter((section) => matchesQuery(section, normalizedQuery));
  }, [normalizedQuery]);

  return (
    <main className="help-page">
      <div className="help-page__inner">
        <LandingNav accountState={accountState} />

        <label className="help-search help-search--hero" htmlFor="help-search">
          <span className="sr-only">Search help</span>
          <input
            id="help-search"
            type="search"
            placeholder="Search"
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
              <div className="help-card__content">
                <h3>{section.title}</h3>
              </div>
            </Link>
          ))}
        </section>
      </div>

      <MarketingFooter />
    </main>
  );
}
