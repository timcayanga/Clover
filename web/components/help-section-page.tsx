import Link from "next/link";
import { getHelpArticleHref, getHelpHomeHref, type HelpSection } from "@/lib/help-center";

type HelpSectionPageProps = {
  section: HelpSection;
  returnTo?: string | null;
};

function SectionVisual({ section }: { section: HelpSection }) {
  return (
    <div className={`help-section-page__visual help-section-page__visual--${section.accent}`} aria-hidden="true">
      <div className="help-section-page__visual-frame">
        <span className="help-section-page__visual-chip">{section.eyebrow}</span>
        <strong>{section.title}</strong>
        <p>{section.summary}</p>
      </div>
      <div className="help-section-page__visual-spark help-section-page__visual-spark--a" />
      <div className="help-section-page__visual-spark help-section-page__visual-spark--b" />
      <div className="help-section-page__visual-spark help-section-page__visual-spark--c" />
    </div>
  );
}

export function HelpSectionPage({ section, returnTo }: HelpSectionPageProps) {
  const homeHref = getHelpHomeHref(returnTo);
  const backHref = returnTo ?? homeHref;
  const backLabel = returnTo ? "Back to account" : "Back to help";
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: section.questions.map((item) => ({
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
      <div className="help-page__inner">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
        <nav className="help-page__nav" aria-label="Help page navigation">
          <Link className="landing-brand" href="/" aria-label="Clover home" prefetch={false}>
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

        <section className="help-section-hero glass">
          <div className="help-section-hero__copy">
            <p className="eyebrow">{section.eyebrow}</p>
            <h1>{section.title}</h1>
            <p>{section.summary}</p>
            <div className="help-section-hero__actions">
              <Link className="button button-primary button-pill" href={backHref} prefetch={false}>
                {backLabel}
              </Link>
              <Link className="button button-secondary button-pill" href={homeHref} prefetch={false}>
                Help home
              </Link>
            </div>
          </div>

          <SectionVisual section={section} />
        </section>

        <section className="help-section-layout">
          <article className="help-section-panel glass">
            <div className="help-section-panel__head">
              <div>
                <p className="eyebrow">Common questions</p>
                <h2>Popular questions for this topic</h2>
              </div>
              <p>
                We keep the answers short and practical so users can understand the workflow before they click deeper into the app.
              </p>
            </div>

            <div className="help-faq-grid">
              {section.questions.map((item) => (
                <article key={item.question} className="help-faq">
                  <h3>{item.question}</h3>
                  <p>{item.answer}</p>
                </article>
              ))}
            </div>
          </article>

          <aside className="help-section-sidebar">
            <article className="help-section-panel help-section-panel--accent glass">
              <p className="eyebrow">Quick facts</p>
              <ul className="help-fact-list">
                {section.highlights.map((highlight) => (
                  <li key={highlight}>{highlight}</li>
                ))}
              </ul>
            </article>

            <article className="help-section-panel glass">
              <p className="eyebrow">Next steps</p>
              <div className="help-section-links">
                {section.links.map((link) => (
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
              <p className="eyebrow">Articles</p>
              <h2>Deep-dive answers for this section</h2>
            </div>
            <p>
              These article pages are designed for longer search queries and the most common help tasks inside this topic.
            </p>
          </div>

          <div className="help-article-grid">
            {section.articles.map((article) => (
              <Link
                key={article.slug}
                className="help-article-card"
                href={getHelpArticleHref(section.slug, article.slug, returnTo)}
                prefetch={false}
              >
                <span className="help-article-card__eyebrow">{section.eyebrow}</span>
                <strong>{article.title}</strong>
                <p>{article.summary}</p>
                <span className="help-article-card__meta">
                  {article.questions.length.toLocaleString()} question{article.questions.length === 1 ? "" : "s"}
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
