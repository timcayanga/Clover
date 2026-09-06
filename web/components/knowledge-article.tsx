import Image from "next/image";
import Link from "next/link";
import type { KnowledgeEntry } from "@/lib/knowledge-types";
import type { KnowledgeCategory } from "@/lib/knowledge-types";
import styles from "./knowledge.module.css";
import { KnowledgeFeedback } from "./knowledge-feedback";

export function KnowledgeArticle({
  entry,
  category,
  related = [],
  preview = false,
}: {
  entry: KnowledgeEntry;
  category?: KnowledgeCategory;
  related?: KnowledgeEntry[];
  preview?: boolean;
}) {
  const { content } = entry;
  const home = content.kind === "help" ? "/help" : "/guides";
  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: content.title,
    description: content.summary,
    mainEntityOfPage: `https://clover.ph${entry.path}`,
    author: { "@type": "Organization", name: "Clover" },
  };
  return (
    <>
      {!preview ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(schema).replace(/</g, "\\u003c"),
          }}
        />
      ) : null}
      <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
        <Link href={home}>
          {content.kind === "help" ? "Help Center" : "Guides"}
        </Link>
        {category && content.kind === "help" ? (
          <>
            <span aria-hidden="true">/</span>
            <Link href={`/help/${category.slug}`}>{category.title}</Link>
          </>
        ) : null}
      </nav>
      <header className={styles.articleHeader}>
        <span className={styles.tag}>
          {preview
            ? "Unpublished preview"
            : content.kind === "guide"
              ? "Guide"
              : "Help article"}
        </span>
        <h1>{content.title}</h1>
        <p>{content.summary}</p>
        <div className={styles.meta}>
          Clover
          {content.reviewedAt ? ` · Sources checked ${content.reviewedAt}` : ""}
          {content.market === "ph" ? " · Philippines" : ""}
        </div>
      </header>
      <div className={styles.articleLayout}>
        <article className={styles.articleBody}>
          {content.category === "plans-billing" ? (
            <aside className={styles.callout}>
              <p>
                Prices can differ by region. Planned allowances are not the same
                as active limits.
              </p>
              <Link href="/pricing">See the current pricing comparison →</Link>
            </aside>
          ) : null}
          {content.sections.map((section, index) => (
            <section key={index} id={`section-${index}`}>
              <h2>{section.heading}</h2>
              <p>{section.body}</p>
            </section>
          ))}
          {content.screenshot ? (
            <figure className={styles.screenshot}>
              <a
                href={content.screenshot}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open full-size screenshot in a new tab"
              >
                <Image
                  src={content.screenshot}
                  alt={content.screenshotAlt ?? "Clover sample screen"}
                  width={402}
                  height={778}
                  sizes="260px"
                />
              </a>
              <figcaption>
                Actual Clover interface with fictional sample data. Select to
                open the full-size image.
              </figcaption>
            </figure>
          ) : null}
          {content.questions.length ? (
            <section id="questions">
              <h2>Common questions</h2>
              {content.questions.map((question, index) => (
                <details key={index} className={styles.faq}>
                  <summary>{question.question}</summary>
                  <p>{question.answer}</p>
                </details>
              ))}
            </section>
          ) : null}
          {content.sources.length ? (
            <section className={styles.sources} id="sources">
              <h2>Sources and verification</h2>
              <p>
                Institution menus and availability can change. Check the
                official instructions if your app looks different. Clover is
                independent of these institutions.
              </p>
              {content.sources.map((source) => (
                <a href={source.url} key={source.url} rel="noopener noreferrer">
                  {source.label} ↗
                </a>
              ))}
            </section>
          ) : null}
          {content.kind === "guide" ? (
            <aside className={styles.callout}>
              <h2>Use your records in Clover</h2>
              <p>
                Upload the files you already have, review the useful details,
                and keep your financial picture organized.
              </p>
              <Link href="/help/getting-started/your-first-upload">
                How to make your first upload →
              </Link>
            </aside>
          ) : null}
          {related.length ? (
            <section>
              <h2>Related help</h2>
              <div className={styles.list}>
                {related.map((item) => (
                  <Link
                    className={styles.result}
                    key={item.path}
                    href={item.path}
                  >
                    {item.content.title} →
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
          {!preview ? <KnowledgeFeedback path={entry.path} /> : null}
        </article>
        <aside className={styles.contents}>
          <details open>
            <summary>On this page</summary>
            {content.sections.map((section, index) => (
              <a key={index} href={`#section-${index}`}>
                {section.heading}
              </a>
            ))}
            {content.questions.length ? (
              <a href="#questions">Common questions</a>
            ) : null}
            {content.sources.length ? <a href="#sources">Sources</a> : null}
          </details>
        </aside>
      </div>
    </>
  );
}
