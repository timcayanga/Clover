"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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

type AccordionCta = {
  label: string;
  href: string;
  primary?: boolean;
};

function AccordionItem({ question, cta }: { question: HelpQuestion; cta?: AccordionCta }) {
  return (
    <details className="help-accordion-item">
      <summary className="help-accordion-item__summary">
        <span>{question.question}</span>
      </summary>
      <div className="help-accordion-item__body">
        <p>{question.answer}</p>
        {cta ? (
          <Link className={`button ${cta.primary ? "button-primary" : "button-secondary"}`} href={cta.href} prefetch={false}>
            {cta.label}
          </Link>
        ) : null}
      </div>
    </details>
  );
}

export function HelpSectionPage({ section, returnTo: _returnTo, accountState }: HelpSectionPageProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();

  const groupedQuestions = useMemo(() => {
    return section.articles
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
          questions: visibleQuestions,
          cta: article.title.toLowerCase().includes("set up")
            ? { label: "Sign up", href: "/sign-up", primary: true }
            : undefined,
        };
      })
      .filter((group): group is NonNullable<typeof group> => Boolean(group));
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <div className="help-page__frame">
        <LandingNav accountState={accountState} />
        <div className="help-page__content help-section-page__inner">
          <div className="help-section-page__search-area">
            <label className="help-search help-search--section" htmlFor="help-section-search">
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
                      <h2>{group.title}</h2>
                    </div>

                    <div className="help-accordion">
                      {group.questions.map((question, index) => (
                        <AccordionItem key={question.question} question={question} cta={index === 0 ? group.cta : undefined} />
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
      </div>
      <MarketingFooter />
    </main>
  );
}
