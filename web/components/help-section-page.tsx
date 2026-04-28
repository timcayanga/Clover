"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { getHelpHomeHref, type HelpQuestion, type HelpSection } from "@/lib/help-center";

type HelpSectionPageProps = {
  section: HelpSection;
  returnTo?: string | null;
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

export function HelpSectionPage({ section, returnTo }: HelpSectionPageProps) {
  const [query, setQuery] = useState("");
  const homeHref = getHelpHomeHref(returnTo);
  const backHref = returnTo ?? homeHref;
  const backLabel = returnTo ? "Back to account" : "Back to help";
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

        <nav className="help-page__nav" aria-label="Help page navigation">
          <Link className="landing-brand" href={backHref} aria-label="Clover home" prefetch={false}>
            <img className="landing-brand__mark" src="/clover-mark.svg" alt="" aria-hidden="true" />
            <img className="landing-brand__wordmark" src="/clover-name-teal.svg" alt="Clover" />
          </Link>
          <div className="help-page__nav-links">
            <Link className="help-page__nav-link" href={backHref} prefetch={false}>
              {backLabel}
            </Link>
            <Link className="help-page__nav-link" href={homeHref} prefetch={false}>
              Help home
            </Link>
          </div>
        </nav>

        <label className="help-search help-search--section" htmlFor="help-section-search">
          <span className="sr-only">Search within this help section</span>
          <input
            id="help-section-search"
            type="search"
            placeholder={`Search ${section.title.toLowerCase()}`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <section className="help-section-header">
          <h1>{section.title}</h1>
          <p>{section.summary}</p>
        </section>

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
    </main>
  );
}
