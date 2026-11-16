"use client";
import { useId, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  searchKnowledge,
  type KnowledgeCategory,
  type KnowledgeEntry,
} from "@/lib/knowledge-types";
import styles from "./knowledge.module.css";

export function KnowledgeBrowser({
  entries,
  categories,
  mode = "help",
  category,
}: {
  entries: KnowledgeEntry[];
  categories: KnowledgeCategory[];
  mode?: "help" | "guide";
  category?: KnowledgeCategory;
}) {
  const [query, setQuery] = useState("");
  const id = useId();
  const results = useMemo(
    () =>
      searchKnowledge(
        entries.filter((e) =>
          category
            ? e.content.category === category.slug && e.content.kind === "help"
            : query
              ? true
              : e.content.kind === mode,
        ),
        query,
      ),
    [entries, query, mode, category],
  );
  const title = category?.title ?? (mode === "help" ? "Help Center" : "Guides");
  return (
    <>
      {category ? (
        <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
          <Link href="/help">Help Center</Link>
          <span aria-hidden="true">/</span>
          <span>{category.title}</span>
        </nav>
      ) : null}
      <section className={styles.hero}>
        <div>
          <h1>{title}</h1>
          <p>
            {category?.summary ??
              (mode === "help"
                ? "Find answers about uploads, accounts, planning, and using Clover."
                : "Practical guides to downloading financial records and organizing them with Clover.")}
          </p>
          <label className={styles.search} htmlFor={id}>
            <span aria-hidden="true">⌕</span>
            <span className="sr-only">
              {category
                ? `Search ${category.title}`
                : "Search Help Center and Guides"}
            </span>
            <input
              id={id}
              type="search"
              placeholder={
                category ? "Search this topic" : "Search help and guides"
              }
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>
        {!category ? (
          <div className={styles.heroPhoto}>
            <Image
              src={
                mode === "help"
                  ? "/assets/feature-stories/manage-hero.webp"
                  : "/assets/feature-stories/understand-hero.webp"
              }
              alt={
                mode === "help"
                  ? "A Clover character organizing records at a bright desk"
                  : "A Clover character reviewing their finances at a café"
              }
              fill
              sizes="(max-width:640px) 100vw, 45vw"
              priority
            />
          </div>
        ) : (
          <Image
            className={styles.icon}
            src={`/assets/3d icons/${category.icon}.png`}
            alt=""
            width={54}
            height={54}
          />
        )}
      </section>
      {query || category ? (
        <section className={styles.section}>
          <h2>{query ? "Search results" : "Articles and answers"}</h2>
          <p role="status" aria-live="polite">
            {results.length} {results.length === 1 ? "article" : "articles"}
            {query ? ` matching “${query}”` : " in this topic"}
          </p>
          <div className={styles.list}>
            {results.map((entry) => (
              <Result key={entry.path} entry={entry} />
            ))}
          </div>
          {!results.length ? (
            <div className={styles.empty}>
              <h3>No matching answers yet</h3>
              <p>
                Try a feature name or a shorter phrase, or contact support
                below.
              </p>
              <button className={styles.button} onClick={() => setQuery("")}>
                Clear search
              </button>
            </div>
          ) : null}
        </section>
      ) : mode === "help" ? (
        <>
          <nav className={styles.starter} aria-label="Start using Clover">
            <Link href="/help/getting-started/your-first-upload">
              <b>1</b>Bring in your records <span aria-hidden="true">→</span>
            </Link>
            <Link href="/help/uploading-reviewing">
              <b>2</b>Review the details <span aria-hidden="true">→</span>
            </Link>
            <Link href="/help/understand-money">
              <b>3</b>See your money clearly <span aria-hidden="true">→</span>
            </Link>
          </nav>
          <section className={styles.section}>
            <h2>Browse by topic</h2>
            <div className={styles.grid}>
              {categories.map((item) => (
                <Link
                  className={styles.card}
                  key={item.slug}
                  href={`/help/${item.slug}`}
                >
                  <Image
                    className={styles.icon}
                    src={`/assets/3d icons/${item.icon}.png`}
                    width={54}
                    height={54}
                    alt=""
                  />
                  <h3>{item.title}</h3>
                  <p>{item.summary}</p>
                  <small>
                    View help <span aria-hidden="true">→</span>
                  </small>
                </Link>
              ))}
            </div>
          </section>
          <section className={styles.section}>
            <h2>Useful starting points</h2>
            <div className={styles.list}>
              {results.slice(0, 4).map((entry) => (
                <Result key={entry.path} entry={entry} />
              ))}
            </div>
          </section>
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2>Download and organize your records</h2>
              <Link href="/guides">All guides →</Link>
            </div>
            <div className={styles.grid}>
              {entries
                .filter((e) => e.content.kind === "guide")
                .slice(0, 3)
                .map((entry) => (
                  <GuideCard key={entry.path} entry={entry} />
                ))}
            </div>
          </section>
        </>
      ) : (
        <section className={styles.section}>
          <h2>All guides</h2>
          <div className={styles.grid}>
            {results.map((entry) => (
              <GuideCard key={entry.path} entry={entry} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
function Result({ entry }: { entry: KnowledgeEntry }) {
  return (
    <Link className={styles.result} href={entry.path}>
      <span className={styles.tag}>
        {entry.content.kind === "help" ? "Help article" : "Guide"}
      </span>
      <h3>
        {entry.content.title} <span aria-hidden="true">→</span>
      </h3>
      <p>{entry.content.summary}</p>
    </Link>
  );
}
function GuideCard({ entry }: { entry: KnowledgeEntry }) {
  return (
    <Link className={styles.card} href={entry.path}>
      <span className={styles.tag}>
        {entry.content.market === "ph" ? "Philippines · Guide" : "Guide"}
      </span>
      <h3>{entry.content.title}</h3>
      <p>{entry.content.summary}</p>
      <small>
        Read guide <span aria-hidden="true">→</span>
      </small>
    </Link>
  );
}
