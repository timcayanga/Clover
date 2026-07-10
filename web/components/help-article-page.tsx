import Link from "next/link";
import { LandingNav } from "@/components/landing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { type HelpArticle, type HelpSection } from "@/lib/help-center";
import type { PublicAccountState } from "@/lib/public-account-state";

type HelpArticlePageProps = {
  section: HelpSection;
  article: HelpArticle;
  returnTo?: string | null;
  accountState?: PublicAccountState | null;
};

function ArticleVisual({ section, article }: { section: HelpSection; article: HelpArticle }) {
  return (
    <div className={`help-article-page__visual help-article-page__visual--${section.accent}`} aria-hidden="true">
      <div className="help-article-page__visual-card">
        <span className="help-article-page__visual-kicker">{section.eyebrow}</span>
        <strong>{article.title}</strong>
        <p>{article.summary}</p>
      </div>
      <div className="help-article-page__visual-bubble help-article-page__visual-bubble--a" />
      <div className="help-article-page__visual-bubble help-article-page__visual-bubble--b" />
      <div className="help-article-page__visual-bubble help-article-page__visual-bubble--c" />
    </div>
  );
}

export function HelpArticlePage({ section, article, returnTo: _returnTo, accountState }: HelpArticlePageProps) {
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: article.questions.map((item) => ({
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
      <div className="help-page__frame">
        <LandingNav accountState={accountState} />
        <div className="help-page__content">

          <section className="help-article-hero glass">
            <div className="help-article-hero__copy">
              <p className="eyebrow">{section.eyebrow}</p>
              <h1>{article.title}</h1>
              <p>{article.summary}</p>
            </div>

            <ArticleVisual section={section} article={article} />
          </section>

          <section className="help-article-layout">
            <article className="help-section-panel glass">
              <div className="help-section-panel__head">
                <div>
                  <p className="eyebrow">How to do it</p>
                  <h2>Step-by-step guide</h2>
                </div>
                <p>{article.seoDescription}</p>
              </div>

              <ol className="help-steps">
                {article.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </article>

            <aside className="help-section-sidebar">
              <article className="help-section-panel help-section-panel--accent glass">
                <p className="eyebrow">Search terms</p>
                <div className="help-tag-list">
                  {article.keywords.map((keyword) => (
                    <span key={keyword}>{keyword}</span>
                  ))}
                </div>
              </article>

              <article className="help-section-panel glass">
                <p className="eyebrow">Next steps</p>
                <div className="help-section-links">
                  {article.links.map((link) => (
                    <Link key={link.href} className="help-section-link" href={link.href} prefetch={false}>
                      <strong>{link.label}</strong>
                      <span>{link.description}</span>
                    </Link>
                  ))}
                </div>
              </article>
            </aside>
          </section>

          <section className="help-section-panel glass">
            <div className="help-section-panel__head">
              <div>
                <p className="eyebrow">Questions</p>
                <h2>Common questions about this article</h2>
              </div>
              <p>These are written to match the kinds of searches people usually make when they need help.</p>
            </div>

            <div className="help-faq-grid">
              {article.questions.map((item) => (
                <article key={item.question} className="help-faq">
                  <h3>{item.question}</h3>
                  <p>{item.answer}</p>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
      <MarketingFooter />
    </main>
  );
}
