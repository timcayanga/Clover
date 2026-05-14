"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { LandingNav } from "@/components/landing-nav";
import { getHelpHomeHref, type HelpQuestion, type HelpSection } from "@/lib/help-center";
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

export function HelpSectionPage({ section, returnTo, accountState }: HelpSectionPageProps) {
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const homeHref = getHelpHomeHref(returnTo);
  const backHref = returnTo ?? homeHref;
  const backLabel = returnTo ? "Back to account" : "Back to help";
  const normalizedQuery = query.trim().toLowerCase();
  const quickPrompts = useMemo(() => section.searchPhrases.slice(0, 4), [section.searchPhrases]);

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

        <div className="help-page__context-links" aria-label="Help context links">
          <Link className="help-page__nav-link" href={backHref} prefetch={false}>
            {backLabel}
          </Link>
          <Link className="help-page__nav-link" href={homeHref} prefetch={false}>
            Help home
          </Link>
          <Link className="help-page__nav-link" href="/contact-us" prefetch={false}>
            Contact us
          </Link>
        </div>

        <section className={`help-section-page__intro help-section-page__intro--${section.accent}`}>
          <div className="help-section-page__intro-copy">
            <p className="eyebrow">{section.eyebrow}</p>
            <h1>{section.title}</h1>
            <p>{section.summary}</p>
            <div className="help-section-page__intro-stats" aria-label="Section summary">
              <span>{section.articles.length} article{section.articles.length === 1 ? "" : "s"}</span>
              <span>{section.questions.length} questions</span>
              <span>{section.searchPhrases.length} search prompts</span>
            </div>
          </div>

          <div className="help-section-page__prompt-panel" aria-label="Popular searches">
            <div className="help-section-page__prompt-panel-head">
              <p className="help-section-page__prompt-label">Popular searches</p>
              <p>Tap one to fill the search bar instantly.</p>
            </div>

            <div className="help-section-page__prompt-list">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  className="help-section-page__prompt"
                  type="button"
                  onClick={() => {
                    setQuery(prompt);
                    searchInputRef.current?.focus();
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        </section>

        <div className="help-section-page__search-area">
          <label className="help-search help-search--section" htmlFor="help-section-search">
            <span className="sr-only">Search within this help section</span>
            <input
              ref={searchInputRef}
              id="help-section-search"
              type="search"
              placeholder={`Search ${section.title.toLowerCase()}`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <div className="help-section-page__search-meta" aria-live="polite">
            <span>
              Showing {filteredQuestions.length} of {section.questions.length} questions
            </span>
            {normalizedQuery ? <span>Results update as you type.</span> : <span>Start with a prompt or type your own.</span>}
          </div>
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

      <footer className="landing-footer" aria-label="Legal links">
        <nav className="landing-footer__nav" aria-label="Legal">
          <Link href="/contact-us" prefetch={false}>
            Contact Us
          </Link>
          <Link href="/privacy-policy" prefetch={false}>
            Privacy Policy
          </Link>
          <Link href="/terms-of-service" prefetch={false}>
            Terms of Service
          </Link>
        </nav>
      </footer>
    </main>
  );
}
