"use client";

import { useMemo, useState } from "react";
import { LandingNav } from "@/components/landing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { type HelpQuestion, type HelpSection } from "@/lib/help-center";
import type { PublicAccountState } from "@/lib/public-account-state";

type HelpSectionPageProps = {
  section: HelpSection;
  returnTo?: string | null;
  accountState?: PublicAccountState | null;
};

function matchesQuestion(question: HelpQuestion, query: string) {
  if (!query) {
    return true;
  }

  return `${question.question} ${question.answer}`.toLowerCase().includes(query);
}

function AccordionItem({ question }: { question: HelpQuestion }) {
  return (
    <details className="help-accordion-item">
      <summary className="help-accordion-item__summary">
        <span>{question.question}</span>
      </summary>
      <div className="help-accordion-item__body">
        <p>{question.answer}</p>
      </div>
    </details>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M10.5 4.5a6 6 0 1 0 0 12a6 6 0 0 0 0-12Zm0-1.5a7.5 7.5 0 1 1 4.73 13.32l4.22 4.21a.75.75 0 1 1-1.06 1.06l-4.21-4.22A7.5 7.5 0 0 1 10.5 3Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function HelpSectionPage({ section, returnTo: _returnTo, accountState }: HelpSectionPageProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();

  const filteredQuestions = useMemo(() => {
    if (!normalizedQuery) {
      return section.questions;
    }

    return section.questions.filter((question) => matchesQuestion(question, normalizedQuery));
  }, [normalizedQuery, section.questions]);

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: filteredQuestions.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  return (
    <main className="help-page">
      <div className="help-page__inner help-section-page__inner">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />

        <LandingNav accountState={accountState} />

        <section className={`help-section-page__intro help-section-page__intro--${section.accent}`}>
          <div className="help-section-page__intro-copy">
            <h1>{section.title}</h1>
            <p>{section.summary}</p>
            <div className="help-section-page__intro-points" aria-label="Section highlights">
              {section.highlights.slice(0, 3).map((highlight) => (
                <span key={highlight}>{highlight}</span>
              ))}
            </div>
          </div>
        </section>

        <div className="help-section-page__search-area">
          <label className="help-search help-search--section" htmlFor="help-section-search">
            <span className="help-search__icon">
              <SearchIcon />
            </span>
            <span className="sr-only">Search within this help section</span>
            <input
              id="help-section-search"
              type="search"
              placeholder="Search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>

        <section className="help-section-faq" aria-label="Questions and answers">
          {filteredQuestions.length > 0 ? (
            <div className="help-accordion">
              {filteredQuestions.map((question) => (
                <AccordionItem key={question.question} question={question} />
              ))}
            </div>
          ) : (
            <div className="help-empty glass">
              <h3>No matches yet.</h3>
              <p>Try a broader search term from this section.</p>
            </div>
          )}
        </section>
      </div>

      <MarketingFooter />
    </main>
  );
}
