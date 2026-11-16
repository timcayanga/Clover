import type { ReactNode } from "react";
import Link from "next/link";
import { PublicBusinessDetails } from "./public-business-details";
import styles from "./public-info.module.css";

export function PublicPolicyDocument({ title, intro, sections }: {
  title: string; intro: string;
  sections: { id: string; title: string; content: ReactNode }[];
}) {
  return <div className={styles.legalShell}>
    <header className={styles.hero}>
      <p className={styles.eyebrow}>Legal &amp; customer support</p>
      <h1>{title}</h1>
      <p className={styles.updated}>Last updated: October 22, 2026</p>
      <p className={styles.intro}>{intro}</p>
    </header>
    <div className={styles.legalLayout}>
      <aside className={styles.toc} aria-label={`${title} contents`}>
        <p>On this page</p>
        <nav>{sections.map(section => <a key={section.id} href={`#${section.id}`}>{section.title}</a>)}</nav>
        <Link href="/terms-of-service">Terms and Conditions</Link>
      </aside>
      <article className={styles.legalContent}>
        {sections.map(section => <section key={section.id} id={section.id} className={styles.legalSection}>
          <h2>{section.title}</h2>{section.content}
        </section>)}
        <section id="business-details" className={styles.legalSection}>
          <h2>Business and customer service details</h2><PublicBusinessDetails />
        </section>
      </article>
    </div>
  </div>;
}
