"use client";

import { useMemo, useState } from "react";
import { LandingNav } from "@/components/landing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { type HelpArticle, type HelpQuestion, type HelpSection } from "@/lib/help-center";
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

function matchesGroup(article: HelpArticle, query: string) {
  if (!query) {
    return true;
  }

  return `${article.title} ${article.summary} ${article.steps.join(" ")} ${article.keywords.join(" ")}`.toLowerCase().includes(query);
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

  const groupedQuestions = useMemo(() => {
    const articleGroups = section.articles
      .map((article) => {
        const questionMatches = article.questions.filter((question) => matchesQuestion(question, normalizedQuery));
        const groupMatches = matchesGroup(article, normalizedQuery);
        const visibleQuestions = normalizedQuery ? (groupMatches ? article.questions : questionMatches) : article.questions;

        if (visibleQuestions.length === 0) {
          return null;
        }

        return {
          key: article.slug,
          title: article.title,
          summary: article.summary,
          questions: visibleQuestions,
        };
      })
      .filter((group): group is NonNullable<typeof group> => Boolean(group));

    const usedQuestions = new Set(articleGroups.flatMap((group) => group.questions.map((question) => question.question)));

    const extraQuestions = section.questions.filter((question) => {
      if (usedQuestions.has(question.question)) {
        return false;
      }

      return matchesQuestion(question, normalizedQuery);
    });

    if (extraQuestions.length > 0) {
      articleGroups.push({
        key: `${section.slug}-more`,
        title: "More answers",
        summary: "Extra questions that come up often when people are working through this part of Clover.",
        questions: extraQuestions,
      });
    }

    return articleGroups;
  }, [normalizedQuery, section]);

  const filteredQuestions = groupedQuestions.flatMap((group) => group.questions);

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
            <div className="help-section-page__groups">
              {groupedQuestions.map((group) => (
                <section key={group.key} className={`help-topic help-topic--${section.accent}`}>
                  <div className="help-topic__intro">
                    <p className="help-topic__eyebrow">{section.eyebrow}</p>
                    <h2>{group.title}</h2>
                    <p>{group.summary}</p>
                  </div>

                  <div className="help-accordion">
                    {group.questions.map((question) => (
                      <AccordionItem key={question.question} question={question} />
                    ))}
                  </div>
                </section>
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
